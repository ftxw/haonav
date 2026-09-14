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

  let path = u.pathname || '';
  // 去掉所有末尾斜杠：根路径 '/' 也归一为空串，于是
  // 'https://a.com/' 与 'https://a.com' 得到同一 key
  path = path.replace(/\/+$/, '');

  const qs = stripTrackingParams(u.search);
  const suffix = `${path}${qs ? `?${qs}` : ''}`;
  return `${u.protocol}//${host}${port}${suffix || ''}`;
}

/**
 * 剥离追踪参数，返回规范化后的 query 串（不含前导 '?'）。
 *
 * ⛔ 绝不能用 `for (const [k, v] of params)` 遍历 URLSearchParams！
 *    for...of 会在迭代「之前」先检查 Symbol.iterator；而部分边缘运行时
 *    （**实测 EdgeOne 的 V8 就没有**）未给 URLSearchParams 实现迭代器协议 ——
 *    于是哪怕 URL 一个查询参数都没有（0 次迭代）也会立刻抛 "is not iterable"，
 *    把整条 link.add / 批量导入链路打成 400（线上 bug：添加链接必失败）。
 *    改用 forEach：它是普通方法，不依赖迭代器协议。
 */
function stripTrackingParams(search: string): string {
  // 绝大多数 URL 没有查询串 → 直接短路，连 URLSearchParams 都不碰，零风险
  if (!search) return '';
  const fallback = search.replace(/^\?/, '');
  try {
    const params = new URLSearchParams(search);
    const kept = new URLSearchParams();
    if (typeof (params as any).forEach !== 'function') return fallback;
    params.forEach((v, k) => {
      const lower = k.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) return;
      kept.append(k, v);
    });
    return kept.toString();
  } catch {
    return fallback;
  }
}

/** 取域名（hostname，小写）。非法 URL 返回空串。 */
export function hostOf(url: string): string {
  try {
    return new URL((url ?? '').trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}
