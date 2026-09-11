import type { Doc } from './models';

export interface FetchDocResult {
  doc: Doc | null;
  notModified: boolean;
}

/**
 * 只读接口：前台零写操作。
 * `/api/data` 走 ETag 协商（Cache-Control: no-cache），浏览器命中时返回 304、响应体 0 字节。
 */
export async function fetchDoc(signal?: AbortSignal): Promise<FetchDocResult> {
  const res = await fetch('/api/data', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (res.status === 304) return { doc: null, notModified: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { doc: (await res.json()) as Doc, notModified: false };
}
