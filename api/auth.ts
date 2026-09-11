/**
 * 认证：常量时间比较 + HMAC-SHA256 签名会话 + 内存限速。
 *
 * ⛔ 硬约束：绝不用 PBKDF2 / scrypt 等多轮 KDF。
 *    Cloudflare Workers 免费版 CPU 上限 10 ms/请求，PBKDF2-SHA256 210k 轮需
 *    100–300 ms，会直接触发 Error 1102，登录完全不可用。
 *    改为**常量时间字符串比较**（< 1 ms），密码放部署 Secret。
 *    在线爆破由"同 IP 5 次/分钟"的限速挡住 —— 排队等网络不计 CPU。
 */

import { SESSION_COOKIE } from './keys';

const encoder = new TextEncoder();

/* ------------------------------------------------------------------ *
 * 常量时间比较
 * ------------------------------------------------------------------ */

/**
 * 常量时间比较：**长度不同也必须遍历固定长度，绝不能提前 return**。
 * 提前 return 会泄漏"前多少位匹配"，配合大量请求可逐位还原密钥。
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a ?? '');
  const bb = encoder.encode(b ?? '');
  const len = Math.max(ab.length, bb.length);
  // 长度差异先折叠进 diff，而不是直接返回 false
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * 密码校验（两种模式）
 * ------------------------------------------------------------------ */

export interface AuthSecrets {
  /** 明文密码（推荐，常量时间比较） */
  adminPassword?: string;
  /** 可选哈希版：HMAC(password, pepper) 的 hex */
  passwordHash?: string;
  /** 可选哈希版：pepper */
  pepper?: string;
}

/** 明文模式：常量时间比较 */
export function verifyPassword(input: string, expected: string): boolean {
  return constantTimeEqual(input ?? '', expected ?? '');
}

/** HMAC-SHA256(pepper, password) → hex。与 scripts/gen-secrets.mjs 保持一致。 */
export async function passwordDigest(password: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(password ?? ''));
  return toHex(new Uint8Array(sig));
}

/**
 * 同时支持两种 Secret：
 *  - 配了 HAONAV_PASSWORD_HASH + HAONAV_PEPPER → 用 HMAC 比较
 *  - 否则用 HAONAV_ADMIN_PASSWORD 常量时间比较（文档推荐后者）
 */
export async function verifyPasswordAgainstConfig(
  input: string,
  cfg: AuthSecrets,
): Promise<boolean> {
  if (cfg.passwordHash && cfg.pepper) {
    const digest = await passwordDigest(input ?? '', cfg.pepper);
    return constantTimeEqual(digest, cfg.passwordHash);
  }
  return verifyPassword(input, cfg.adminPassword ?? '');
}

/* ------------------------------------------------------------------ *
 * 会话：HMAC-SHA256 签名，格式 <payloadB64>.<sigB64>（base64url）
 * ------------------------------------------------------------------ */

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return new Uint8Array(sig);
}

export async function signSession(payload: object, secret: string): Promise<string> {
  const p = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const sig = await hmac(secret, p);
  return `${p}.${b64urlEncode(sig)}`;
}

/** 验签失败 / 过期 / 格式非法一律返回 null（不区分原因，避免信息泄漏） */
export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  if (typeof token !== 'string' || token.length === 0) return null;
  const idx = token.indexOf('.');
  if (idx <= 0 || idx === token.length - 1) return null;
  const p = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = b64urlEncode(await hmac(secret, p));
  if (!constantTimeEqual(sig, expected)) return null;
  let payload: any;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number') return null;
  if (payload.exp * 1000 < Date.now()) return null;
  return payload as SessionPayload;
}

/** 便捷：签发一个管理员会话 */
export async function issueSession(
  secret: string,
  maxAgeSec: number,
  now: number = Date.now(),
): Promise<string> {
  const iat = Math.floor(now / 1000);
  return signSession({ sub: 'admin', iat, exp: iat + maxAgeSec }, secret);
}

/* ------------------------------------------------------------------ *
 * Cookie 工具
 * ------------------------------------------------------------------ */

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export function buildSessionCookie(token: string, maxAge: number, secure = true): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(secure = true): string {
  const parts = [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function getSessionToken(cookieHeader: string | null | undefined): string | null {
  return parseCookies(cookieHeader)[SESSION_COOKIE] ?? null;
}

/* ------------------------------------------------------------------ *
 * 内存限速（best-effort，isolate 内）
 * ------------------------------------------------------------------ */

export interface RateLimiter {
  /** 返回 true 表示允许本次请求（并计入一次） */
  check(key: string): boolean;
  reset(key?: string): void;
}

/**
 * ⚠️ 不要用 KV 计数：免费版仅 1,000 写/天，登录限速会把额度烧光。
 * 内存 Map 是 best-effort —— isolate 重启会清空，但足以挡住自动化爆破。
 */
export function createRateLimiter(maxPerMinute: number, windowMs = 60_000): RateLimiter {
  const buckets = new Map<string, { count: number; start: number }>();
  return {
    check(key: string): boolean {
      const now = Date.now();
      const b = buckets.get(key);
      if (!b || now - b.start >= windowMs) {
        buckets.set(key, { count: 1, start: now });
        return true;
      }
      if (b.count >= maxPerMinute) return false;
      b.count++;
      return true;
    },
    reset(key?: string) {
      if (key === undefined) buckets.clear();
      else buckets.delete(key);
    },
  };
}

/** 固定延迟（失败后调用）。等待不计 CPU，但抬高爆破成本。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
