import { reactive } from 'vue';
import type { Doc, Op } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../web/lib/settings';
import { api, ApiError, AuthError } from './adminApi';
import { diffOps } from './diffOps';

export type PanelId = 'links' | 'categories' | 'search' | 'data' | 'backup' | 'settings';

export const state = reactive({
  booted: false,
  authed: false,
  checking: true,
  saving: false,
  dirty: false,
  error: '',
  panel: 'links' as PanelId,
  doc: null as Doc | null,
  toast: '',
  /** 409 冲突时的服务端版本，弹窗三选一 */
  conflict: null as null | { serverRev: number; serverDoc: Doc | null },
});

/** 与服务端一致的最后版本（diff 基准） */
let savedDoc: Doc | null = null;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string): void {
  state.toast = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (state.toast = ''), 2200);
}

/**
 * 出厂默认 ⊕ 服务端 settings：服务端文档可能是部分对象（全新部署时 settings 为 `{}`），
 * 不补齐默认值，设置面板访问 settings.backup.mode 等会直接崩。
 */
function normalizeSettings(d: Doc): Doc {
  const s = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) } as Doc['settings'];
  s.backup = { ...DEFAULT_SETTINGS.backup, ...(d.settings?.backup ?? {}) };
  s.icon = { ...DEFAULT_SETTINGS.icon, ...(d.settings?.icon ?? {}) };
  s.searchEngines = d.settings?.searchEngines ?? DEFAULT_SETTINGS.searchEngines;
  s.footerLinks = d.settings?.footerLinks ?? DEFAULT_SETTINGS.footerLinks;
  return { ...d, settings: s };
}

function clone(d: Doc): Doc {
  return JSON.parse(JSON.stringify(d)) as Doc;
}

function adopt(raw: Doc): void {
  const d = normalizeSettings(raw);
  state.doc = d;
  savedDoc = clone(d);
  state.dirty = false;
  state.error = '';
}

// ─────────────────────────── 会话 ───────────────────────────

export async function boot(): Promise<void> {
  if (state.booted) return;
  state.booted = true;
  state.checking = true;
  try {
    // 必须先用「会话探针」判断是否登录：/api/data 是公开只读接口，未登录同样返回 200，
    // 用它当探针会让后台在无会话时照常打开，直到第一次保存被 401 打回才跳登录页。
    const ok = await api.session();
    if (ok) {
      adopt(await api.getData());
      state.authed = true;
    } else {
      state.authed = false;
    }
  } catch (e) {
    if (e instanceof AuthError) state.authed = false;
    else state.error = e instanceof Error ? e.message : '加载失败';
  } finally {
    state.checking = false;
  }
}

export async function login(password: string): Promise<boolean> {
  state.error = '';
  try {
    await api.login(password);
    adopt(await api.getData());
    state.authed = true;
    return true;
  } catch (e) {
    // 后端对失败统一返回「密码错误」，不区分原因
    state.error = e instanceof Error ? e.message : '登录失败';
    return false;
  }
}

export async function logout(): Promise<void> {
  try {
    await api.logout();
  } catch {
    /* 已经过期也无妨 */
  }
  state.authed = false;
  state.doc = null;
  savedDoc = null;
  state.dirty = false;
}

// ─────────────────────────── 本地变更 ───────────────────────────

/**
 * 面板内联编辑（设置 / 搜索 / 备份）走「草稿」：先改 state.doc，由面板自己的
 * 「保存」按钮调用 commitCurrent() 一次性落库。分类 / 链接等走「即时落库」：直接 commit()。
 */
export function mutate(fn: (d: Doc) => void): void {
  if (!state.doc) return;
  const next = clone(state.doc);
  fn(next);
  state.doc = next;
  state.dirty = savedDoc ? JSON.stringify(next) !== JSON.stringify(savedDoc) : true;
}

export async function reload(): Promise<void> {
  try {
    adopt(await api.getData());
  } catch (e) {
    if (e instanceof AuthError) state.authed = false;
    else state.error = e instanceof Error ? e.message : '刷新失败';
  }
}

/** 导入等走服务端写入的流程完成后：以服务端为准重新对齐 */
export function adoptServerDoc(d: Doc): void {
  adopt(d);
}

// ─────────────────────────── 保存（即时 / 批量） ───────────────────────────

/**
 * 即时落库：把 fn 应用到文档副本算出 ops，立即 PATCH。成功才写回 state.doc（乐观更新，
 * 失败回滚），rev 以服务端返回为准。分类 / 链接面板的增删改、排序、置顶、批量都用它 ——
 * 不再有「顶栏保存」按钮，弹窗里的「保存」即直接落库。
 */
export async function commit(fn: (d: Doc) => void): Promise<boolean> {
  if (!state.doc) return false;
  const prev = clone(state.doc);
  const next = clone(state.doc);
  fn(next);
  const ops = diffOps(prev, next);
  if (!ops.length) return true;

  state.doc = next; // 乐观更新
  state.saving = true;
  state.error = '';
  try {
    const { rev } = await api.patch(state.doc.rev, ops);
    state.doc = { ...state.doc, rev };
    savedDoc = clone(state.doc);
    state.dirty = false;
    return true;
  } catch (e) {
    state.doc = prev; // 回滚
    handleSaveError(e);
    return false;
  } finally {
    state.saving = false;
  }
}

/** 已是草稿（mutate 改过 state.doc）的面板用：把与 savedDoc 的差异一次性提交 */
export async function commitOps(ops: Op[]): Promise<boolean> {
  if (!state.doc || !ops.length) return true;
  state.saving = true;
  state.error = '';
  try {
    const { rev } = await api.patch(state.doc.rev, ops);
    state.doc = { ...state.doc, rev };
    savedDoc = clone(state.doc);
    state.dirty = false;
    return true;
  } catch (e) {
    handleSaveError(e);
    return false;
  } finally {
    state.saving = false;
  }
}

/** 设置 / 搜索 / 备份面板的「保存」按钮：提交草稿与已存版本的差异 */
export async function commitCurrent(): Promise<boolean> {
  if (!savedDoc || !state.doc) return true;
  return commitOps(diffOps(savedDoc, state.doc));
}

/** 409 / 401 / 其它错误的统一处理（复用现有冲突弹窗） */
function handleSaveError(e: unknown): void {
  if (e instanceof ApiError) {
    if (e.status === 409) {
      state.conflict = {
        serverRev: typeof e.payload?.rev === 'number' ? e.payload.rev : 0,
        serverDoc: (e.payload?.doc as Doc | undefined) ?? null,
      };
      return;
    }
  }
  if (e instanceof AuthError) {
    state.authed = false;
    return;
  }
  state.error = e instanceof Error ? e.message : '保存失败';
}

// ─────────────────────────── 409 冲突 ───────────────────────────

/** 默认选项：放弃我的改动并刷新（最不容易丢数据） */
export function conflictDiscard(): void {
  const d = state.conflict?.serverDoc;
  state.conflict = null;
  if (d) {
    adopt(d);
    toast('已放弃本地改动');
  } else {
    void reload();
  }
}

/** 强制用我的版本覆盖：以服务端最新 rev 重发同一批 ops */
export async function conflictForce(): Promise<void> {
  const c = state.conflict;
  state.conflict = null;
  if (!c || !state.doc || !savedDoc) return;
  state.saving = true;
  try {
    const ops = diffOps(savedDoc, state.doc);
    const { rev } = await api.patch(c.serverRev, ops);
    const next = { ...state.doc, rev };
    state.doc = next;
    savedDoc = clone(next);
    state.dirty = false;
    toast('已强制覆盖');
  } catch (e) {
    state.error = e instanceof Error ? e.message : '覆盖失败';
  } finally {
    state.saving = false;
  }
}

/** 切回页面时若服务端更新且本地无未保存改动 → 静默对齐 */
export function startAutoRefresh(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || state.dirty || !state.doc) return;
    void (async () => {
      try {
        const d = await api.getData();
        if (d.rev !== state.doc?.rev && !state.dirty) adopt(d);
      } catch {
        /* 静默 */
      }
    })();
  });
}
