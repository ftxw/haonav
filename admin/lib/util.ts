export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * 专供 `/api/icon?u=` 使用的 host：**小写、保留 `www.`**，必须与
 * `api/urlKey.ts` 的 `hostOf()` 完全一致 —— 服务端 `collectHosts()` 用它建
 * SSRF 白名单，剥掉 `www.` 会不匹配 → 静默 404、永远只有字母图标。
 * ⚠️ 上面的 `hostOf()` 会剥 `www.`，**不可用于拼图标 URL**。
 */
export function hostForIcon(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function maxOrderOf(orders: string[]): string | null {
  let max: string | null = null;
  for (const o of orders) {
    if (typeof o !== 'string' || !o) continue;
    if (max === null || o > max) max = o;
  }
  return max;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (v: number): string => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 生成分类名对应的稳定 id（导入时用于新建分类） */
export function slugId(prefix: string, name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return `${prefix}-${h.toString(36)}`;
}
