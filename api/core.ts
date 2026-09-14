/**
 * HaoNav 核心 API —— Hono 应用。
 *
 * ★ 本文件**绝不出现任何平台符号**：不写 `env.HAONAV_KV`、不写 `c.env`、
 *   不 import 任何平台 SDK。Store 与配置全部通过参数注入。
 *   平台差异只允许出现在 api/adapters/ 与 api/store.ts。
 *   （这是对"三套后端互相打架"的根本解法；若本文件因平台差异长分支，说明设计错了。）
 *
 * CPU 预算：每个请求都要能在 10 ms 内做完。
 *   - 排队等网络（KV 读、fetch）不计 CPU
 *   - 因此"多几次 KV 读"免费，"多做几次哈希 / 序列化 / 正则 / 遍历"才要命
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Category, Doc, LinkItem, Op, SnapshotMeta } from '../shared/types';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  KV,
  SCHEMA_VERSION,
} from './keys';
import type { Store } from './store';
import {
  buildSessionCookie,
  clearSessionCookie,
  constantTimeEqual,
  createRateLimiter,
  getSessionToken,
  issueSession,
  sleep,
  verifyPasswordAgainstConfig,
  verifySession,
  type RateLimiter,
} from './auth';
import { appendOrder, between, ORDER_DIGITS } from './order';
import { normalizeUrl, hostOf } from './urlKey';
import { validateDoc } from './validate';

/* ------------------------------------------------------------------ *
 * 配置与依赖（全部注入，零平台耦合）
 * ------------------------------------------------------------------ */

export interface ServerConfig {
  adminPassword?: string;
  /** 可选哈希版 */
  passwordHash?: string;
  pepper?: string;
  sessionSecret: string;
  /** 'cloudflare' | 'edgeone' | 'dev' */
  platform: string;
  /** 平台 Cron 调用的内部标记（未配则禁用 Cron 路径） */
  cronSecret?: string;
  /** 是否给 cookie 加 Secure（dev 下 http 无法存 Secure cookie，故 dev 关掉） */
  secureCookies?: boolean;
  /** 测试注入 */
  fetchImpl?: typeof fetch;
  /** 登录失败固定延迟（ms），默认 500 */
  loginDelayMs?: number;
  now?: () => number;
}

export interface AppDeps {
  store: Store;
  config: ServerConfig;
  /** 可选：注入限速器（默认用模块级单例，保证 isolate 内跨请求累积） */
  limiter?: RateLimiter;
}

/** 模块级单例：isolate 内跨请求累积，重启即清空（best-effort） */
const DEFAULT_LIMITER = createRateLimiter(5);

/* ------------------------------------------------------------------ *
 * 通用工具
 * ------------------------------------------------------------------ */

const encoder = new TextEncoder();

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  // ⚠️ 不用 Response.json()（EdgeOne V8 运行时不支持）
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/** FNV-1a 32 位：< 1 ms，用于 ETag（比 crypto.subtle.digest 少一次异步开销） */
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function minimalDoc(now: number): Doc {
  return {
    schemaVersion: SCHEMA_VERSION as 1,
    rev: 0,
    updatedAt: now,
    // settings 保持空对象：L1 出厂默认由前端与 site.config.json 合并，服务端不读它
    settings: {} as unknown as Doc['settings'],
    categories: [],
    links: [],
  };
}

/**
 * 文档不存在时返回的稳定空文档。
 * 必须**固定不变**，否则每次请求都会生成不同的 ETag，协商缓存永远无法命中 304。
 */
const EMPTY_DOC_TEXT = JSON.stringify(minimalDoc(0));

function getClientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ||
    (c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

/** 写接口 Origin 校验：不同源 → 403。无 Origin（非浏览器 / Cron）→ 放行。 */
function isSameOrigin(c: Context): boolean {
  const origin = c.req.header('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(c.req.url).host;
  } catch {
    return false;
  }
}

function isSecure(config: ServerConfig): boolean {
  if (typeof config.secureCookies === 'boolean') return config.secureCookies;
  return config.platform !== 'dev';
}

/* ------------------------------------------------------------------ *
 * 会话
 * ------------------------------------------------------------------ */

async function requireSession(c: Context, config: ServerConfig): Promise<Response | null> {
  const token = getSessionToken(c.req.header('cookie'));
  if (!token) return jsonResponse({ error: '未登录' }, 401);
  const payload = await verifySession(token, config.sessionSecret);
  if (!payload || payload.sub !== 'admin') return jsonResponse({ error: '会话无效' }, 401);
  return null;
}

/** 会话 或 Cron 内部标记 */
async function requireSessionOrCron(c: Context, config: ServerConfig): Promise<Response | null> {
  const cron = c.req.header('x-haonav-cron');
  if (cron && config.cronSecret && constantTimeEqual(cron, config.cronSecret)) return null;
  return requireSession(c, config);
}

/* ------------------------------------------------------------------ *
 * 文档读写
 * ------------------------------------------------------------------ */

async function readDocForWrite(
  store: Store,
  now: number,
): Promise<{ doc: Doc; text: string }> {
  const text = await store.getText(KV.DOC);
  if (!text) {
    const d = minimalDoc(now);
    return { doc: d, text: JSON.stringify(d) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('stored document is not valid JSON');
  }
  const v = validateDoc(parsed);
  if (!v.ok) throw new Error(`stored document invalid: ${v.error}`);
  return { doc: v.doc, text };
}

/** 一次 KV 写：rev+1 + 更新时间 */
async function commitDoc(store: Store, doc: Doc, now: number): Promise<string> {
  const next: Doc = { ...doc, rev: doc.rev + 1, updatedAt: now };
  const text = JSON.stringify(next);
  const v = validateDoc(next);
  if (!v.ok) throw new Error(`refusing to write invalid document: ${v.error}`);
  await store.putText(KV.DOC, text);
  return text;
}

/* ------------------------------------------------------------------ *
 * ops 应用（内存中逐条原子应用；任一条非法 → 整批判定失败，不落库）
 * ------------------------------------------------------------------ */

class OpError extends Error {}

/* ── link.icon 清洗（唯一入口，语义：自定义图标 URL，仅 http/https） ──
 * 规则：非字符串 / trim 后不匹配 ^https?:// / 长度 > 2048 → undefined（等于删除该字段）。
 * 前端取值规则见 workers.js:1203 —— 只有 icon 以 http 开头才直链，否则回退本地字母图标。
 */
const ICON_URL_RE = /^https?:\/\//i;
const MAX_ICON_URL = 2048;

function sanitizeIcon(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || s.length > MAX_ICON_URL || !ICON_URL_RE.test(s)) return undefined;
  return s;
}

/* ── link.desc 清洗 ──
 * ⚠️ 为什么必须有：清除描述时客户端发的是 `desc: null`（JSON.stringify 会丢掉 undefined 的键，
 *    见 admin/lib/diffOps.ts），若不在这里归一，`null` 会原样写进库 —— 文档里留下 `desc: null`
 *    而不是「没有这个字段」，与 `desc?: string` 的类型约定不符，且会在文档体积/diff 里留垃圾。
 * 规则：null / 非字符串 / trim 后为空 → undefined（等于删除该字段）。
 */
function sanitizeDesc(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function hydrateLink(link: LinkItem, now: number): LinkItem {
  const url = typeof link.url === 'string' ? link.url : '';
  return {
    ...link,
    id: typeof link.id === 'string' && link.id ? link.id : crypto.randomUUID(),
    title: typeof link.title === 'string' ? link.title : '',
    url,
    urlKey: typeof link.urlKey === 'string' && link.urlKey ? link.urlKey : normalizeUrl(url),
    cat: typeof link.cat === 'string' ? link.cat : '',
    order: typeof link.order === 'string' && link.order ? link.order : between(null, null),
    createdAt: typeof link.createdAt === 'number' ? link.createdAt : now,
    // 统一清洗：非法 icon 一律丢弃（不能进库）
    icon: sanitizeIcon(link.icon),
    // 同理：导入的来源可能给 desc: null，归一为「无此字段」
    desc: sanitizeDesc(link.desc),
  };
}

function applyOps(doc: Doc, ops: Op[], now: number): Doc {
  const d: Doc = {
    ...doc,
    settings: { ...doc.settings },
    categories: doc.categories.map((c) => ({ ...c })),
    links: doc.links.map((l) => ({ ...l })),
  };

  for (const op of ops) {
    if (!op || typeof (op as any).t !== 'string') throw new OpError('op 缺少 t');
    switch (op.t) {
      case 'link.add': {
        d.links.push(hydrateLink({ ...op.link }, now));
        break;
      }
      case 'link.update': {
        const i = d.links.findIndex((l) => l.id === op.id);
        if (i < 0) throw new OpError(`link.update: 未找到 ${op.id}`);
        const patch = { ...op.patch };
        if (typeof patch.url === 'string') patch.urlKey = normalizeUrl(patch.url);
        // icon 走统一清洗：非法 → undefined（即删除该字段），避免脏值进库
        if ('icon' in patch) patch.icon = sanitizeIcon(patch.icon);
        // desc 同理：客户端清空描述时发的是 null，必须归一，否则库里会留 desc: null
        if ('desc' in patch) patch.desc = sanitizeDesc(patch.desc);
        d.links[i] = { ...d.links[i], ...patch };
        break;
      }
      case 'link.move': {
        const i = d.links.findIndex((l) => l.id === op.id);
        if (i < 0) throw new OpError(`link.move: 未找到 ${op.id}`);
        if (typeof op.order !== 'string') throw new OpError('link.move: order 非法');
        const moved: LinkItem = { ...d.links[i], order: op.order };
        if (op.cat !== undefined) moved.cat = op.cat;
        d.links[i] = moved;
        break;
      }
      case 'link.delete': {
        const i = d.links.findIndex((l) => l.id === op.id);
        if (i < 0) throw new OpError(`link.delete: 未找到 ${op.id}`);
        d.links.splice(i, 1);
        break;
      }
      case 'link.pin': {
        const i = d.links.findIndex((l) => l.id === op.id);
        if (i < 0) throw new OpError(`link.pin: 未找到 ${op.id}`);
        d.links[i] = { ...d.links[i], pinned: !!op.pinned };
        break;
      }
      case 'cat.add': {
        if (!op.cat || typeof op.cat.id !== 'string') throw new OpError('cat.add: cat 非法');
        if (d.categories.some((c) => c.id === op.cat.id)) throw new OpError('cat.add: id 重复');
        d.categories.push({ ...op.cat });
        break;
      }
      case 'cat.update': {
        const i = d.categories.findIndex((c) => c.id === op.id);
        if (i < 0) throw new OpError(`cat.update: 未找到 ${op.id}`);
        d.categories[i] = { ...d.categories[i], ...op.patch };
        break;
      }
      case 'cat.move': {
        const i = d.categories.findIndex((c) => c.id === op.id);
        if (i < 0) throw new OpError(`cat.move: 未找到 ${op.id}`);
        if (typeof op.order !== 'string') throw new OpError('cat.move: order 非法');
        d.categories[i] = { ...d.categories[i], order: op.order };
        break;
      }
      case 'cat.delete': {
        const i = d.categories.findIndex((c) => c.id === op.id);
        if (i < 0) throw new OpError(`cat.delete: 未找到 ${op.id}`);
        d.categories.splice(i, 1);
        // 保留链接，仅置为"未分类"（绝不因删分类而丢数据）
        for (let k = 0; k < d.links.length; k++) {
          if (d.links[k].cat === op.id) d.links[k] = { ...d.links[k], cat: '' };
        }
        break;
      }
      case 'cat.merge': {
        const from = d.categories.find((c) => c.id === op.fromId);
        if (!from) throw new OpError(`cat.merge: 未找到源分类 ${op.fromId}`);
        if (!d.categories.some((c) => c.id === op.toId)) {
          throw new OpError(`cat.merge: 未找到目标分类 ${op.toId}`);
        }
        let last = maxOrderOf(d.links.filter((l) => l.cat === op.toId).map((l) => l.order));
        for (let k = 0; k < d.links.length; k++) {
          if (d.links[k].cat === op.fromId) {
            last = appendOrder(last);
            d.links[k] = { ...d.links[k], cat: op.toId, order: last };
          }
        }
        d.categories = d.categories.filter((c) => c.id !== op.fromId);
        break;
      }
      case 'settings.update': {
        const patch = { ...op.patch } as Partial<Doc['settings']>;
        const merged: Doc['settings'] = { ...d.settings, ...patch };
        if (patch.backup) {
          merged.backup = { ...(d.settings as any).backup, ...patch.backup };
        }
        d.settings = merged;
        break;
      }
      default:
        throw new OpError(`未知 op 类型: ${(op as any).t}`);
    }
  }
  return d;
}

function maxOrderOf(orders: string[]): string | null {
  let max: string | null = null;
  for (const o of orders) {
    if (typeof o !== 'string') continue;
    if (max === null || o > max) max = o;
  }
  return max;
}

/* ------------------------------------------------------------------ *
 * 导入
 * ------------------------------------------------------------------ */

interface ImportItem {
  title: string;
  url: string;
  desc?: string;
  cat?: string;
  pinned?: boolean;
  icon?: string;
}

function coerceItems(raw: unknown): ImportItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    if (typeof o.url !== 'string' || !o.url.trim()) continue;
    out.push({
      title: typeof o.title === 'string' ? o.title : '',
      url: o.url,
      desc: typeof o.desc === 'string' ? o.desc : undefined,
      cat: typeof o.cat === 'string' ? o.cat : undefined,
      pinned: typeof o.pinned === 'boolean' ? o.pinned : undefined,
      icon: sanitizeIcon(o.icon),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 导出（Netscape Bookmark File Format）
 * ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function byOrder(a: { order: string }, b: { order: string }): number {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
}

function exportNetscape(doc: Doc): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const cats = [...doc.categories].sort(byOrder);
  for (const cat of cats) {
    lines.push(`    <DT><H3>${escapeHtml(cat.name)}</H3>`);
    lines.push('    <DL><p>');
    const links = doc.links.filter((l) => l.cat === cat.id).sort(byOrder);
    for (const l of links) {
      const addDate = Math.floor((l.createdAt || 0) / 1000);
      lines.push(
        `        <DT><A HREF="${escapeHtml(l.url)}" ADD_DATE="${addDate}">${escapeHtml(l.title)}</A>`,
      );
      if (l.desc) lines.push(`        <DD>${escapeHtml(l.desc)}`);
    }
    lines.push('    </DL><p>');
  }
  const known = new Set(cats.map((c) => c.id));
  const orphans = doc.links.filter((l) => !known.has(l.cat)).sort(byOrder);
  if (orphans.length) {
    lines.push('    <DT><H3>未分类</H3>');
    lines.push('    <DL><p>');
    for (const l of orphans) {
      const addDate = Math.floor((l.createdAt || 0) / 1000);
      lines.push(
        `        <DT><A HREF="${escapeHtml(l.url)}" ADD_DATE="${addDate}">${escapeHtml(l.title)}</A>`,
      );
    }
    lines.push('    </DL><p>');
  }
  lines.push('</DL><p>', '');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * 快照（index-aside，绝不用 KV.list）
 * ------------------------------------------------------------------ */

async function readSnapshotIndex(store: Store): Promise<SnapshotMeta[]> {
  const text = await store.getText(KV.SNAPSHOT_INDEX);
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? (arr as SnapshotMeta[]) : [];
  } catch {
    return [];
  }
}

async function writeSnapshotIndex(store: Store, index: SnapshotMeta[]): Promise<void> {
  await store.putText(KV.SNAPSHOT_INDEX, JSON.stringify(index));
}

async function saveSnapshot(
  store: Store,
  docText: string,
  retention: number,
  now: number,
): Promise<SnapshotMeta> {
  const at = now;
  const key = KV.SNAPSHOT_PREFIX + new Date(at).toISOString();
  await store.putText(key, docText);

  const meta: SnapshotMeta = { key, at, size: docText.length };
  let index = await readSnapshotIndex(store);
  index.push(meta);
  index.sort((a, b) => b.at - a.at); // 新 → 旧

  const keep = Math.max(1, Math.min(30, retention || 7));
  const dropped = index.slice(keep);
  index = index.slice(0, keep);
  await writeSnapshotIndex(store, index);
  // 删除最旧的（按 retention 滚动）
  for (const d of dropped) {
    await store.del(d.key);
  }
  return meta;
}

function retentionOf(doc: Doc): number {
  const r = (doc.settings as any)?.backup?.retention;
  return typeof r === 'number' && r >= 1 && r <= 30 ? r : 7;
}

/* ------------------------------------------------------------------ *
 * /api/icon 的 SSRF 防护
 * ------------------------------------------------------------------ */

const DDG_HOST = 'icons.duckduckgo.com';

function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if (a > 255 || b > 255 || c > 255 || d > 255) return true; // 畸形 → 拦
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 127) return true; // 127/8
  if (a === 169 && b === 254) return true; // 169.254/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === 'metadata.google.internal') return true;
  if (h.includes(':')) {
    // IPv6
    if (h === '::1' || h === '::') return true;
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7 (ULA)
    if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // fe80::/10 (link-local)
    // IPv4-mapped ::ffff:a.b.c.d
    const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIpv4(mapped[1]);
    return false;
  }
  return isPrivateIpv4(h);
}

function collectHosts(doc: Doc): Set<string> {
  const set = new Set<string>();
  for (const l of doc.links) {
    const h = hostOf(l.url);
    if (h) set.add(h);
  }
  return set;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchWithTimeout(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { redirect: 'manual', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ── /api/icon：首页 HTML 解析（无 DOM、无 HTMLRewriter、无 Node 内建） ──
 * ⚠️ CPU 只有 10 ms：只读前 64 KB 就必须停（见 readTextBounded），只用一条线性正则扫描
 *    （无嵌套量词 → 无灾难性回溯）。HTMLRewriter 是 Cloudflare 专有 API，EdgeOne V8 没有 —— 禁用。
 */
const HTML_SCAN_BYTES = 64 * 1024;

/**
 * 只读前 maxBytes 字节的文本（超限即 cancel，绝不无上限缓冲整页）。
 * 网络等待不计 CPU；读取本身是流式，避免 res.text() 把整页拉进内存。
 */
async function readTextBounded(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (total >= maxBytes) break; // 到上限立刻停，不再多读一字节
    }
    out += decoder.decode();
  } catch {
    /* 读取中断：用已读到的部分尽力解析 */
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* 已读完 / 已被取消 */
    }
  }
  // 单个 chunk 可能 > maxBytes：再按字符截断一次，确保正则只见到前 ≤64 KB
  return out.length > maxBytes ? out.slice(0, maxBytes) : out;
}

/**
 * 仅一条正则（无 DOM、无 HTMLRewriter）：匹配 <link ...> 且 rel 含 "icon"，捕获 rel 与 href。
 * ⚠️ rel 用**贪婪**捕获 ([^"'>]*)：若改成惰性 *?，`["']?` 会先吞掉起始引号、导致 rel 捕获成空串
 *    —— 实测会漏掉 apple-touch-icon（务必别改回 *?）。href 用惰性 + 排除引号/空白。
 * 返回时优先 apple-touch-icon，其次第一个任意 *icon*（含 shortcut icon / mask-icon）。
 * ⚠️ 同步执行、无 await —— 模块级正则的 lastIndex 不会被并发请求交错污染。
 */
const ICON_LINK_RE =
  /<link\b[^>]*?\brel\s*=\s*["']?([^"'>]*)["']?[^>]*?\bhref\s*=\s*["']?([^"'>\s]+)["']?/gi;

function pickIconHref(html: string): string | null {
  ICON_LINK_RE.lastIndex = 0;
  let fallback: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = ICON_LINK_RE.exec(html)) !== null) {
    const rel = (m[1] || '').toLowerCase();
    const href = m[2];
    if (!href) continue;
    if (rel.includes('apple-touch-icon')) return href; // 高质量档：命中即止
    if (fallback === null && rel.includes('icon')) fallback = href;
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * 死链批量探测
 * ------------------------------------------------------------------ */

/** 子请求上限 50/请求 → 单批 20 留足余量 */
const MAX_CHECK_URLS = 20;
/** 每条探测超时（网络等待不计 CPU） */
const CHECK_TIMEOUT_MS = 5000;
/** 并发度：5 × 4 轮 = 20 条；子请求总数不变（≤50），但把最坏墙钟时间压到 ~1/5 */
const CHECK_CONCURRENCY = 5;

interface CheckResult {
  url: string;
  ok: boolean;
  status?: number;
}

async function probeUrl(raw: string, fetchImpl: typeof fetch): Promise<CheckResult> {
  let target: URL | null = null;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') target = u;
  } catch {
    target = null;
  }
  // 非法 URL / 非 http(s) / 私网段 → 一律不可达（复用 /api/icon 的黑名单）
  if (!target || isPrivateHost(target.hostname)) {
    return { url: raw, ok: false };
  }
  try {
    const res = await fetchWithTimeout(raw, fetchImpl, CHECK_TIMEOUT_MS);
    // 2xx / 3xx → 可达；4xx / 5xx → 死链
    if (res.status >= 200 && res.status < 400) {
      return { url: raw, ok: true, status: res.status };
    }
    return { url: raw, ok: false, status: res.status };
  } catch {
    // 超时 / 网络错误 / DNS 失败：无 status
    return { url: raw, ok: false };
  }
}

/** 按入参顺序返回结果；并发分批，子请求总数 = 条数（≤ 20） */
async function probeUrls(urls: string[], fetchImpl: typeof fetch): Promise<CheckResult[]> {
  const results: CheckResult[] = new Array(urls.length);
  for (let i = 0; i < urls.length; i += CHECK_CONCURRENCY) {
    const chunk = urls.slice(i, i + CHECK_CONCURRENCY);
    await Promise.all(
      chunk.map((url, j) =>
        probeUrl(url, fetchImpl).then((r) => {
          results[i + j] = r;
        }),
      ),
    );
  }
  return results;
}

/**
 * 带重定向次数限制的抓取，每跳都重新校验目标（防 DNS rebinding / 302 绕行）。
 * ⚠️ Workers V8 无 DNS 解析 API，无法在 fetch 前拿到解析后的 IP ——
 *    因此第一道防线是"只允许抓取文档中已登记的域名"，第二道是 IP 字面量 / 本地域名黑名单。
 */
async function safeFetch(
  startUrl: string,
  fetchImpl: typeof fetch,
  validate: (u: string) => boolean,
  maxRedirects = 2,
  timeoutMs = 3000,
): Promise<Response | null> {
  let url = startUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!validate(url)) return null;
    let res: Response;
    try {
      res = await fetchWithTimeout(url, fetchImpl, timeoutMs);
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      try {
        url = new URL(loc, url).toString();
      } catch {
        return null;
      }
      continue;
    }
    return res;
  }
  return null; // 重定向过多
}

/* ------------------------------------------------------------------ *
 * 应用工厂
 * ------------------------------------------------------------------ */

export function createApp(deps: AppDeps): Hono {
  const { store, config } = deps;
  const limiter = deps.limiter ?? DEFAULT_LIMITER;
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = () => (config.now ? config.now() : Date.now());
  const app = new Hono();

  /* ── GET /api/data：公开可读 + ETag 协商 ── */
  app.get('/api/data', async (c) => {
    const text = (await store.getText(KV.DOC)) ?? EMPTY_DOC_TEXT;
    const etag = `W/"${hashString(text)}-${text.length}"`;
    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache',
      ETag: etag,
      'Content-Type': 'application/json; charset=utf-8',
    };
    const inm = c.req.header('if-none-match');
    if (inm && inm === etag) {
      // 304：响应体 0 字节
      return new Response(null, { status: 304, headers });
    }
    return new Response(text, { status: 200, headers });
  });

  /* ── GET /api/health ── */
  app.get('/api/health', (c) =>
    jsonResponse({ status: 'ok', platform: config.platform, time: now() }),
  );

  /* ── POST /api/login ── */
  app.post('/api/login', async (c) => {
    if (!isSameOrigin(c)) return jsonResponse({ error: '拒绝跨站请求' }, 403);
    const ip = getClientIp(c);
    if (!limiter.check(ip)) {
      return jsonResponse({ error: '尝试过于频繁，请稍后再试' }, 429);
    }
    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    const password = body && typeof body.password === 'string' ? body.password : '';
    const ok = await verifyPasswordAgainstConfig(password, config);
    if (!ok) {
      // 固定延迟 + 统一消息（不区分原因，不泄漏是格式还是长度问题）
      await sleep(config.loginDelayMs ?? 500);
      return jsonResponse({ error: '密码错误' }, 401);
    }
    const token = await issueSession(config.sessionSecret, SESSION_MAX_AGE, Date.now());
    return jsonResponse(
      { ok: true },
      200,
      { 'Set-Cookie': buildSessionCookie(token, SESSION_MAX_AGE, isSecure(config)) },
    );
  });

  /* ── POST /api/logout ── */
  app.post('/api/logout', (c) =>
    jsonResponse({ ok: true }, 200, {
      'Set-Cookie': clearSessionCookie(isSecure(config)),
    }),
  );

  /* ── GET /api/session：真正的会话探针（后台据此判断"是否已登录"） ──
   * ⚠️ GET /api/data 是公开只读路由，绝不能拿它当登录探针（否则无会话也显示已登录，
   *    直到第一次 PATCH 被 401 打回、客户端才跳登录页 —— 即本次报的"保存失败并退出登录"）。
   * ⚠️ 本路由**不得**带 ETag / 协商缓存：客户端若命中 304 会拿到空响应体，
   *    被误判为"未登录"而踢回登录页。故显式 no-store，每次都回真实会话状态。
   */
  app.get('/api/session', async (c) => {
    const denied = await requireSession(c, config);
    if (denied) return denied;
    return jsonResponse({ ok: true, sub: 'admin' }, 200, { 'Cache-Control': 'no-store' });
  });

  /* ── PATCH /api/data：乐观并发 ── */
  app.patch('/api/data', async (c) => {
    if (!isSameOrigin(c)) return jsonResponse({ error: '拒绝跨站请求' }, 403);
    const denied = await requireSession(c, config);
    if (denied) return denied;

    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      return jsonResponse({ error: '请求体非法' }, 400);
    }
    if (!body || typeof body.rev !== 'number' || !Array.isArray(body.ops)) {
      return jsonResponse({ error: '请求体非法' }, 400);
    }

    let current: { doc: Doc; text: string };
    try {
      current = await readDocForWrite(store, now());
    } catch {
      return jsonResponse({ error: '服务端数据异常' }, 500);
    }

    if (body.rev !== current.doc.rev) {
      // 409 + 返回服务端最新文档
      return jsonResponse({ error: '数据已在别处被修改', rev: current.doc.rev, doc: current.doc }, 409);
    }

    let next: Doc;
    try {
      next = applyOps(current.doc, body.ops as Op[], now());
    } catch (e) {
      if (e instanceof OpError) return jsonResponse({ error: e.message }, 400);
      return jsonResponse({ error: '操作应用失败' }, 400);
    }

    const v = validateDoc(next);
    if (!v.ok) return jsonResponse({ error: `文档校验失败：${v.error}` }, 400);

    try {
      await commitDoc(store, next, now());
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const status = msg.includes('invalid') || msg.includes('too') ? 400 : 500;
      return jsonResponse({ error: status === 400 ? '保存被拒绝' : '保存失败' }, status);
    }
    return jsonResponse({ rev: next.rev + 1 });
  });

  /* ── POST /api/import/parse：单批（≤200）diff，不落库 ── */
  app.post('/api/import/parse', async (c) => {
    if (!isSameOrigin(c)) return jsonResponse({ error: '拒绝跨站请求' }, 403);
    const denied = await requireSession(c, config);
    if (denied) return denied;

    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      return jsonResponse({ error: '请求体非法' }, 400);
    }
    const items = coerceItems(body?.items);
    if (items.length > 200) {
      return jsonResponse({ error: '单批最多 200 条' }, 400);
    }
    const targetCat = typeof body?.targetCat === 'string' ? body.targetCat : undefined;

    let current: { doc: Doc; text: string };
    try {
      current = await readDocForWrite(store, now());
    } catch {
      return jsonResponse({ error: '服务端数据异常' }, 500);
    }

    const existingByKey = new Map<string, LinkItem>();
    for (const l of current.doc.links) existingByKey.set(l.urlKey, l);

    const added: ImportItem[] = [];
    const existing: ImportItem[] = [];
    const conflict: { item: ImportItem; existing: LinkItem }[] = [];
    const seen = new Set<string>();

    for (const item of items) {
      const key = normalizeUrl(item.url);
      const cat = targetCat ?? item.cat ?? '';
      const prev = existingByKey.get(key);
      if (!prev) {
        if (seen.has(key)) {
          // 批内重复视为"已存在"
          existing.push(item);
        } else {
          seen.add(key);
          added.push(item);
        }
        continue;
      }
      if (prev.title === item.title && prev.cat === cat) {
        existing.push(item);
      } else {
        conflict.push({ item, existing: prev });
      }
    }

    return jsonResponse({
      added,
      existing,
      conflict,
      counts: { added: added.length, existing: existing.length, conflict: conflict.length },
    });
  });

  /* ── POST /api/import/apply：按批原子追加，order 一律追加到末尾 ── */
  app.post('/api/import/apply', async (c) => {
    if (!isSameOrigin(c)) return jsonResponse({ error: '拒绝跨站请求' }, 403);
    const denied = await requireSession(c, config);
    if (denied) return denied;

    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      return jsonResponse({ error: '请求体非法' }, 400);
    }
    if (!body || typeof body.rev !== 'number') {
      return jsonResponse({ error: '请求体非法' }, 400);
    }
    const items = coerceItems(body.items);
    if (items.length === 0) return jsonResponse({ error: '没有可导入的条目' }, 400);
    if (items.length > 200) return jsonResponse({ error: '单批最多 200 条' }, 400);
    const targetCat = typeof body.targetCat === 'string' ? body.targetCat : undefined;

    let current: { doc: Doc; text: string };
    try {
      current = await readDocForWrite(store, now());
    } catch {
      return jsonResponse({ error: '服务端数据异常' }, 500);
    }
    if (body.rev !== current.doc.rev) {
      return jsonResponse(
        { error: '数据已在别处被修改', rev: current.doc.rev, doc: current.doc },
        409,
      );
    }

    const doc = current.doc;
    const existingKeys = new Set(doc.links.map((l) => l.urlKey));
    const lastByCat = new Map<string, string | null>();
    for (const l of doc.links) {
      const prev = lastByCat.get(l.cat) ?? null;
      lastByCat.set(l.cat, prev === null || l.order > prev ? l.order : prev);
    }

    const t = now();
    let count = 0;
    const nextLinks = [...doc.links];
    for (const item of items) {
      const key = normalizeUrl(item.url);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      const cat = targetCat ?? item.cat ?? '';
      const order = appendOrder(lastByCat.get(cat) ?? null);
      lastByCat.set(cat, order);
      nextLinks.push(
        hydrateLink(
          {
            id: crypto.randomUUID(),
            title: item.title,
            url: item.url,
            urlKey: key,
            desc: item.desc,
            cat,
            order,
            pinned: item.pinned,
            icon: item.icon,
            createdAt: t,
          } as LinkItem,
          t,
        ),
      );
      count++;
    }

    if (count === 0) return jsonResponse({ rev: doc.rev, added: 0 });

    const next: Doc = { ...doc, links: nextLinks };
    const v = validateDoc(next);
    if (!v.ok) return jsonResponse({ error: `文档校验失败：${v.error}` }, 400);

    try {
      await commitDoc(store, next, t);
    } catch {
      return jsonResponse({ error: '保存失败' }, 500);
    }
    return jsonResponse({ rev: next.rev + 1, added: count });
  });

  /* ── GET /api/export?format=html|json（需会话） ── */
  app.get('/api/export', async (c) => {
    const denied = await requireSession(c, config);
    if (denied) return denied;

    const format = (c.req.query('format') || 'json').toLowerCase();
    let current: { doc: Doc; text: string };
    try {
      current = await readDocForWrite(store, now());
    } catch {
      return jsonResponse({ error: '服务端数据异常' }, 500);
    }

    if (format === 'html') {
      return new Response(exportNetscape(current.doc), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': 'attachment; filename="haonav-bookmarks.html"',
        },
      });
    }
    return new Response(JSON.stringify(current.doc), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="haonav-backup.json"',
      },
    });
  });

  /* ── GET /api/icon?u=<domain>&v=<hash>：favicon 代理 ──
   * 契约：客户端传 u = hostname（小写、保留 www），必须与 api/urlKey.ts 的 hostOf()
   *       一致 —— collectHosts() 用它建 allow-list，不一致会静默 404。
   *       （自定义图标 URL 前端直接热链，不走本接口，故无需扩 allow-list。）
   * 三档按质量排序，命中即返回：
   *   1) 抓站点首页 HTML 解析 apple-touch-icon / rel~=icon 指向的图标（最佳质量）
   *   2) https://<domain>/favicon.ico
   *   3) DuckDuckGo ip3/<domain>.ico
   * 全部失败仍返回 404 → 前端回退本地字母图标（比通用占位 SVG 更好，勿改占位图）。
   */
  app.get('/api/icon', async (c) => {
    const domain = (c.req.query('u') || '').trim().toLowerCase();
    if (!domain || isPrivateHost(domain)) {
      return new Response(null, { status: 404 });
    }

    // 命中 KV 缓存
    const cached = await store.getText(KV.ICON_PREFIX + domain);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { ct: string; b64: string };
        if (parsed?.b64) {
          return new Response(base64ToBytes(parsed.b64), {
            status: 200,
            headers: {
              'Content-Type': parsed.ct || 'image/x-icon',
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
      } catch {
        /* 缓存损坏 → 继续抓取 */
      }
    }

    // 只允许抓取文档中已登记的域名（SSRF 第一道防线）
    let allowed: Set<string>;
    try {
      const { doc } = await readDocForWrite(store, now());
      allowed = collectHosts(doc);
    } catch {
      return new Response(null, { status: 404 });
    }
    if (!allowed.has(domain)) return new Response(null, { status: 404 });

    // SSRF 闸门：每一跳都必须过这里，只允许 https 且 host 只能是 domain 或 DDG_HOST。
    // ⚠️ 不得放宽 allow-list（含首页解析出的图标 URL —— 第三方 CDN 主机一律拒绝，落到 2/3 档）。
    const validate = (u: string): boolean => {
      let parsed: URL;
      try {
        parsed = new URL(u);
      } catch {
        return false;
      }
      if (parsed.protocol !== 'https:') return false;
      const h = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      if (isPrivateHost(h)) return false;
      return h === domain || h === DDG_HOST;
    };

    // 命中即返回：仅接受 image/*，≤100 KB 才写缓存（避免 KV 单值与额度被滥用）
    const serveImage = async (res: Response): Promise<Response | null> => {
      const ct = res.headers.get('content-type') || 'image/x-icon';
      if (!ct.startsWith('image/')) return null;
      let buf: Uint8Array;
      try {
        buf = new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
      if (buf.length === 0) return null;
      if (buf.length <= 100 * 1024) {
        try {
          await store.putText(
            KV.ICON_PREFIX + domain,
            JSON.stringify({ ct, b64: bytesToBase64(buf) }),
          );
        } catch {
          /* 缓存失败不影响本次返回 */
        }
      }
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': ct,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    };

    // ── 1 档：首页 HTML → <link rel="apple-touch-icon"/rel~="icon" href> 图标 ──
    const homeUrl = `https://${domain}/`;
    const home = await safeFetch(homeUrl, fetchImpl, validate);
    if (home && home.ok) {
      const pct = (home.headers.get('content-type') || '').toLowerCase();
      // 只解析 HTML/XML，避免对二进制做正则（省 CPU）
      if (!pct || pct.includes('html') || pct.includes('xml')) {
        const html = await readTextBounded(home, HTML_SCAN_BYTES);
        const href = html ? pickIconHref(html) : null;
        if (href) {
          let abs: string | null = null;
          try {
            abs = new URL(href, homeUrl).toString();
          } catch {
            abs = null;
          }
          if (abs && validate(abs)) {
            const iconRes = await safeFetch(abs, fetchImpl, validate);
            if (iconRes && iconRes.ok) {
              const served = await serveImage(iconRes);
              if (served) return served;
            }
          }
        }
      }
    }

    // ── 2 / 3 档：favicon.ico → DuckDuckGo ip3 ──
    const upstreams = [`https://${domain}/favicon.ico`, `https://${DDG_HOST}/ip3/${domain}.ico`];
    for (const up of upstreams) {
      const res = await safeFetch(up, fetchImpl, validate);
      if (!res || !res.ok) continue;
      const served = await serveImage(res);
      if (served) return served;
    }

    // 失败 → 404（前端据此回退本地字母图标）
    return new Response(null, { status: 404 });
  });

  /* ── GET /api/backup/snapshots：快照列表（index-aside，一次 KV 读） ── */
  app.get('/api/backup/snapshots', async (c) => {
    const denied = await requireSession(c, config);
    if (denied) return denied;

    // ⚠️ 只读 SNAPSHOT_INDEX 这一个 key，绝不用 KV.list()（免费版 List 仅 1,000/天）
    const index = await readSnapshotIndex(store);
    const snapshots = [...index].sort((a, b) => b.at - a.at); // 新 → 旧
    return jsonResponse({ snapshots });
  });

  /* ── DELETE /api/backup/snapshot：删除单份快照 ──
   * 手动删除不受 retention 限制（retention 只约束"自动滚动删除"）。
   * 同时注册 POST /api/backup/snapshot/delete 别名：部分 CDN / 代理会丢弃
   * DELETE 的请求体，且 DELETE 带 body 在少数运行时不保证送达。
   */
  const handleDeleteSnapshot = async (c: Context): Promise<Response> => {
    if (!isSameOrigin(c)) return jsonResponse({ error: '拒绝跨站请求' }, 403);
    const denied = await requireSession(c, config);
    if (denied) return denied;

    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      return jsonResponse({ error: '请求体非法' }, 400);
    }
    const key = typeof body?.key === 'string' ? body.key : '';
    if (!key.startsWith(KV.SNAPSHOT_PREFIX)) {
      return jsonResponse({ error: '快照 key 非法' }, 400);
    }

    const index = await readSnapshotIndex(store);
    const next = index.filter((m) => m.key !== key);
    if (next.length === index.length) {
      return jsonResponse({ error: '快照不存在' }, 404);
    }

    // 先删正文再改索引：索引先改会造成"列表消失但正文还在"的残留
    try {
      await store.del(key);
    } catch {
      /* 正文已丢/不可删时仍继续清理索引，避免列表里留幽灵条目 */
    }
    try {
      await writeSnapshotIndex(store, next);
    } catch {
      return jsonResponse({ error: '快照索引更新失败' }, 500);
    }
    return jsonResponse({ ok: true, count: next.length });
  };

  app.delete('/api/backup/snapshot', handleDeleteSnapshot);
  app.post('/api/backup/snapshot/delete', handleDeleteSnapshot);

  /* ── POST /api/backup/snapshot ── */
  app.post('/api/backup/snapshot', async (c) => {
    if (!isSameOrigin(c)) return jsonResponse({ error: '拒绝跨站请求' }, 403);
    const denied = await requireSessionOrCron(c, config);
    if (denied) return denied;

    let current: { doc: Doc; text: string };
    try {
      current = await readDocForWrite(store, now());
    } catch {
      return jsonResponse({ error: '服务端数据异常' }, 500);
    }
    const t = now();
    const meta = await saveSnapshot(store, JSON.stringify(current.doc), retentionOf(current.doc), t);
    const index = await readSnapshotIndex(store);
    return jsonResponse({ ok: true, key: meta.key, count: index.length });
  });

  /* ── POST /api/backup/restore ── */
  app.post('/api/backup/restore', async (c) => {
    if (!isSameOrigin(c)) return jsonResponse({ error: '拒绝跨站请求' }, 403);
    const denied = await requireSession(c, config);
    if (denied) return denied;

    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      return jsonResponse({ error: '请求体非法' }, 400);
    }
    const key = typeof body?.key === 'string' ? body.key : '';
    if (!key.startsWith(KV.SNAPSHOT_PREFIX)) {
      return jsonResponse({ error: '快照 key 非法' }, 400);
    }

    const snapText = await store.getText(key);
    if (!snapText) return jsonResponse({ error: '快照不存在' }, 404);

    let snapDoc: Doc;
    try {
      const v = validateDoc(JSON.parse(snapText));
      if (!v.ok) return jsonResponse({ error: '快照内容非法' }, 400);
      snapDoc = v.doc;
    } catch {
      return jsonResponse({ error: '快照内容非法' }, 400);
    }

    let current: { doc: Doc; text: string };
    try {
      current = await readDocForWrite(store, now());
    } catch {
      return jsonResponse({ error: '服务端数据异常' }, 500);
    }
    const t = now();

    // 恢复前先把当前文档另存一份（防误操作）
    await saveSnapshot(store, JSON.stringify(current.doc), retentionOf(current.doc), t);

    // 关键：rev = 当前 rev + 1（绝不能沿用快照里的旧 rev）
    const restored: Doc = {
      ...snapDoc,
      rev: current.doc.rev + 1,
      updatedAt: t,
    };
    const v = validateDoc(restored);
    if (!v.ok) return jsonResponse({ error: `文档校验失败：${v.error}` }, 400);
    try {
      await store.putText(KV.DOC, JSON.stringify(restored));
    } catch {
      return jsonResponse({ error: '恢复失败' }, 500);
    }
    return jsonResponse({ rev: restored.rev });
  });

  /* ── POST /api/check/links：服务端批量死链探测（按需，不缓存不落库） ──
   * 前端 no-cors fetch 拿不到状态码，探测必须走服务端。
   * 网络等待不计 CPU；子请求上限 50/请求 → 单批 ≤20 留余量。
   */
  app.post('/api/check/links', async (c) => {
    if (!isSameOrigin(c)) return jsonResponse({ error: '拒绝跨站请求' }, 403);
    const denied = await requireSession(c, config);
    if (denied) return denied;

    let body: any = null;
    try {
      body = await c.req.json();
    } catch {
      return jsonResponse({ error: '请求体非法' }, 400);
    }
    if (!body || !Array.isArray(body.urls)) {
      return jsonResponse({ error: '请求体非法' }, 400);
    }
    const urls: string[] = body.urls.filter((u: unknown) => typeof u === 'string');
    if (urls.length > MAX_CHECK_URLS) {
      return jsonResponse({ error: `单批最多 ${MAX_CHECK_URLS} 条` }, 400);
    }

    const results = await probeUrls(urls, fetchImpl);
    return jsonResponse({ results });
  });

  /* ── 兜底 ── */
  app.notFound((c) => jsonResponse({ error: 'Not Found' }, 404));
  app.onError(() => jsonResponse({ error: 'Internal Server Error' }, 500));

  return app;
}

/**
 * 供 adapter 直接复用：把配置从"环境对象"里读出来（平台无关）。
 * 只做取值，不 import 任何平台 SDK。
 */
export function configFromEnv(env: any, platform: string): ServerConfig {
  const e = env ?? {};
  return {
    adminPassword: e.HAONAV_ADMIN_PASSWORD ?? e.HaoNav_ADMIN_PASSWORD,
    passwordHash: e.HAONAV_PASSWORD_HASH,
    pepper: e.HAONAV_PEPPER,
    sessionSecret: e.HAONAV_SESSION_SECRET ?? '',
    platform,
    cronSecret: e.HAONAV_CRON_SECRET,
    secureCookies: platform === 'dev' ? false : true,
  };
}

// 供 core 内部与测试使用
export { ORDER_DIGITS, between, normalizeUrl, hostOf };
