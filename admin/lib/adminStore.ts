import { reactive } from 'vue';
import type { Doc } from '../../shared/types';
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
/** 撤销栈：只存内存，最多 10 步，绝不写 localStorage / KV */
const undoStack: Doc[] = [];

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
  undoStack.length = 0;
}

// ─────────────────────────── 会话 ───────────────────────────

export async function boot(): Promise<void> {
  if (state.booted) return;
  state.booted = true;
  state.checking = true;
  try {
    // 必须先用「会话探针」判断是否登录：/api/data 是公开只读接口，
    // 未登录同样返回 200，用它当探针会让后台在无会话时照常打开，
    // 直到第一次保存被 401 挡下才跳回登录页（即「点保存就退出登录」）。
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
  undoStack.length = 0;
}

// ─────────────────────────── 本地变更 / 撤销 ───────────────────────────

/** 所有面板通过它改文档：自动入撤销栈并标记 dirty */
export function mutate(fn: (d: Doc) => void): void {
  if (!state.doc) return;
  undoStack.push(clone(state.doc));
  if (undoStack.length > 10) undoStack.shift();
  const next = clone(state.doc);
  fn(next);
  state.doc = next;
  state.dirty = true;
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function undo(): boolean {
  const prev = undoStack.pop();
  if (!prev || !state.doc) return false;
  state.doc = prev;
  state.dirty = savedDoc ? JSON.stringify(prev) !== JSON.stringify(savedDoc) : false;
  return true;
}

export async function reload(): Promise<void> {
  try {
    adopt(await api.getData());
  } catch (e) {
    if (e instanceof AuthError) state.authed = false;
    else state.error = e instanceof Error ? e.message : '刷新失败';
  }
}

/** 导入等走服务端写入的流程完成后：以服务端为准重新对齐（丢弃撤销栈） */
export function adoptServerDoc(d: Doc): void {
  adopt(d);
}

// ─────────────────────────── 保存 ───────────────────────────

export async function save(): Promise<boolean> {
  if (!state.doc || !savedDoc) return false;
  if (!state.dirty) return true;

  const ops = diffOps(savedDoc, state.doc);
  if (!ops.length) {
    state.dirty = false;
    return true;
  }

  state.saving = true;
  state.error = '';
  try {
    const { rev } = await api.patch(state.doc.rev, ops);
    const next = { ...state.doc, rev };
    state.doc = next;
    savedDoc = clone(next);
    state.dirty = false;
    undoStack.length = 0;
    toast(`已保存（${ops.length} 项变更）`);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      state.conflict = {
        serverRev: typeof e.payload?.rev === 'number' ? e.payload.rev : 0,
        serverDoc: (e.payload?.doc as Doc | undefined) ?? null,
      };
    } else if (e instanceof AuthError) {
      state.authed = false;
    } else {
      state.error = e instanceof Error ? e.message : '保存失败';
    }
    return false;
  } finally {
    state.saving = false;
  }
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
    undoStack.length = 0;
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
