import type { Doc } from './models';

/** 统一版本化前缀：升级 schemaVersion 时同步提升版本号，旧 key 直接忽略 */
const PREFIX = 'haonav.v1.';

export const LS_DOC = `${PREFIX}doc`;
export const LS_THEME = `${PREFIX}theme`;
export const LS_CARD = `${PREFIX}cardStyle`;
export const LS_ACTIVE = `${PREFIX}activeCat`;

export interface DocCache {
  rev: number;
  doc: Doc;
  at: number;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式 / 配额满：静默降级 */
  }
}

export function readDocCache(): DocCache | null {
  const raw = safeGet(LS_DOC);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DocCache;
    if (!parsed || !parsed.doc || !Array.isArray(parsed.doc.links)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDocCache(doc: Doc): void {
  safeSet(LS_DOC, JSON.stringify({ rev: doc.rev, doc, at: Date.now() } satisfies DocCache));
}

/** 只读回白名单内的值，避免脏数据 */
export function readPref<T extends string>(key: string, allowed: readonly T[]): T | null {
  const v = safeGet(key);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function writePref(key: string, value: string): void {
  safeSet(key, value);
}
