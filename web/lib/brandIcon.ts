import type { BrandIcon } from './models';
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

/** 字母色块：方形圆角 + 居中首字 */
function letterBlock(char: string, fill: string, fg: string, size = 64): string {
  const r = Math.round(size * 0.24);
  const fs = Math.round(size * 0.5);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<rect width="${size}" height="${size}" rx="${r}" fill="${fill}"/>` +
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

/** 品牌图标 → favicon：letter/emoji 本地生成，image 直接用 URL */
export function brandIconUri(icon: BrandIcon | undefined, name: string, accent: string): string {
  if (icon && icon.type === 'image' && icon.value) return icon.value;
  if (icon && icon.type === 'emoji' && icon.value) return svgToDataUri(emojiBlock(icon.value));
  const value = (icon && icon.value) || name;
  return svgToDataUri(letterBlock(firstChar(value), accent, '#fff'));
}

export { svgToDataUri, letterBlock, emojiBlock, firstChar };
