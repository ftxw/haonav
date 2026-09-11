/**
 * URL 规范化 —— 生成 urlKey 用于去重（从 O(n²) 比对变成 Set 查表）。
 *
 * 规则（前后端必须一致，前端另有一份等价实现）：
 *  1. trim
 *  2. 去掉末尾斜杠（根路径 '/' 也归一为空，故 'https://a.com/' == 'https://a.com'）
 *  3. host 小写（path / query 的大小写保留）
 *  4. 剥离追踪参数：utm_*、fbclid、gclid、spm、from
 *  5. 丢弃 fragment（#...）
 *  6. 非法 URL **不抛异常**
 */

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'spm', 'from', 'msclkid', 'yclid', '_openstat']);

export function normalizeUrl(url: string): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    // 非法 URL：尽力而为，绝不抛异常
    return raw.replace(/\/+$/, '');
  }

  const host = u.hostname.toLowerCase();
  const port = u.port ? `:${u.port}` : '';

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(u.search);
  } catch {
    params = new URLSearchParams();
  }
  const kept = new URLSearchParams();
  for (const [k, v] of params) {
    const lower = k.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) continue;
    kept.append(k, v);
  }

  let path = u.pathname || '';
  // 去掉所有末尾斜杠：根路径 '/' 也归一为空串，于是
  // 'https://a.com/' 与 'https://a.com' 得到同一 key
  path = path.replace(/\/+$/, '');

  const qs = kept.toString();
  const suffix = `${path}${qs ? `?${qs}` : ''}`;
  return `${u.protocol}//${host}${port}${suffix || ''}`;
}

/** 取域名（hostname，小写）。非法 URL 返回空串。 */
export function hostOf(url: string): string {
  try {
    return new URL((url ?? '').trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}
