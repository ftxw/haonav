/**
 * 图标服务的 preconnect —— 构建期静态注入 + 运行时补充。
 *
 * 构建期：vite.config.ts 按 site.config.json 的 iconApi 把 origin 注入 index.html，
 *         首帧前即生效（省掉首个图标的 DNS + TCP + TLS 往返）。
 * 运行时：iconApi 可被 KV settings 覆盖，静态注入的 origin 就可能与实际图标服务不符，
 *         所以拿到真实 settings 后再补一条（幂等，同 origin 不重复插入）。
 */

/** 解析 iconApi 的 origin；解析不出 → 空串（绝不返回 undefined / null 字面量） */
export function iconApiOrigin(iconApi?: string | null): string {
  if (!iconApi) return '';
  try {
    return new URL(iconApi).origin;
  } catch {
    return '';
  }
}

/**
 * 若页面里还没有指向该 origin 的 preconnect，就往 <head> 补一条。
 * 幂等：重复调用不会重复插入。非浏览器环境（SSR / 单测）静默返回。
 *
 * ⚠️ 不加 crossorigin：图标是 <img> 发起的 no-cors 请求，带 crossorigin 的 preconnect
 *    建立的是 CORS 模式连接，img 不会复用，反而白建一条连接。
 */
export function ensureIconApiPreconnect(iconApi?: string | null): void {
  if (typeof document === 'undefined' || typeof location === 'undefined') return;
  const origin = iconApiOrigin(iconApi);
  if (!origin) return;

  const links = document.head.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]');
  for (const link of links) {
    try {
      if (link.href && new URL(link.href, location.href).origin === origin) return; // 已存在
    } catch {
      /* href 无法解析，忽略这一条 */
    }
  }

  const el = document.createElement('link');
  el.rel = 'preconnect';
  el.href = origin;
  document.head.appendChild(el);
}
