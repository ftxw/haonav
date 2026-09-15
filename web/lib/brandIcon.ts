import type { BrandIcon, IconStrategy } from './models';
import { paletteColor } from './ui';

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const XML_ESCAPE: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
};

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => XML_ESCAPE[c] ?? c);
}

function firstChar(s: string): string {
  const t = String(s || '').trim();
  return Array.from(t)[0] || '·';
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** 字母色块：直角方形 + 居中首字（直角 —— 圆角交由外层容器/阴影统一控制，避免两层圆角不一致） */
function letterBlock(char: string, fill: string, fg: string, size = 64): string {
  const fs = Math.round(size * 0.5);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" fill="${fill}"/>` +
    `<text x="${size / 2}" y="${size / 2}" dy=".04em" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" ` +
    `font-size="${fs}" font-weight="600" fill="${fg}" text-anchor="middle" dominant-baseline="central">${esc(char)}</text>` +
    `</svg>`
  );
}

function emojiBlock(char: string, size = 64): string {
  const fs = Math.round(size * 0.62);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<text x="${size / 2}" y="${size / 2}" dy=".04em" font-size="${fs}" text-anchor="middle" dominant-baseline="central">${esc(char)}</text>` +
    `</svg>`
  );
}

/** 链接图标（letter 策略）：颜色由域名从固定色板稳定取色，零请求 */
export function linkLetterIcon(title: string, url: string): string {
  const host = hostOf(url);
  return svgToDataUri(letterBlock(firstChar(title), paletteColor(host), '#fff'));
}

/* ─────────── 站外搜索引擎图标（前台搜索框 / 后台引擎列表共用同一套规则） ─────────── */

/** 第三方站点图标服务（方案 B：浏览器直连；自带一年 `Cache-Control` + CORS `*`） */
export const XINAC_ICON_API = 'https://api.xinac.net/icon/?url=';

/**
 * 引擎图标抓取地址。搜索引擎存的是**模板 URL**（如 `https://www.google.com/search?q=`），
 * 直接拿去抓 favicon 会带上整条查询串，故先取 `origin`（站点根）再抓。
 */
export function engineIconUrl(url: string): string {
  const v = String(url || '').trim();
  if (!v) return '';
  try {
    return XINAC_ICON_API + encodeURIComponent(new URL(v).origin);
  } catch {
    return XINAC_ICON_API + encodeURIComponent(v);
  }
}

/**
 * 引擎图标取值 —— 与链接卡片（LinkCard）完全同一套规则，前后台共用：
 *  - `letter`：本地字母色块（零请求）；
 *  - `fetched`：自定义 `icon`（http(s)）优先 → 按 origin 自动抓取 → 字母回退；
 *  - `failed`（当前图标加载失败）→ 立刻回退字母块，避免破图。
 */
export function engineIconSrc(
  eng: { name: string; url: string; icon?: string },
  strategy: IconStrategy,
  failed = false,
): string {
  const letter = linkLetterIcon(eng.name, eng.url);
  if (strategy !== 'fetched' || failed) return letter;
  const custom = eng.icon && /^https?:\/\//i.test(eng.icon) ? eng.icon : '';
  return custom || engineIconUrl(eng.url) || letter;
}

/** 品牌图标 → favicon：letter/emoji 本地生成，image 直接用 URL */
export function brandIconUri(icon: BrandIcon | undefined, name: string, accent: string): string {
  if (icon && icon.type === 'image' && icon.value) return icon.value;
  if (icon && icon.type === 'emoji' && icon.value) return svgToDataUri(emojiBlock(icon.value));
  const value = (icon && icon.value) || name;
  return svgToDataUri(letterBlock(firstChar(value), accent, '#fff'));
}

export { svgToDataUri, letterBlock, emojiBlock, firstChar };
