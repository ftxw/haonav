/**
 * UI 收敛模块：三档卡片网格、字母图标色板、跨组件复用的类名组合。
 * 网格类名必须是完整字面量 —— 绝不能 `grid-cols-${n}` 拼接（Tailwind 静态扫描会 purge）。
 * 视觉基准：v1-legacy（git show v1-legacy:App.tsx）。
 */
import type { CardStyle } from './models';

/* ── 卡片网格：card 详情 / compact 简洁 / icon 纯图标 ── */
export const GRID: Record<CardStyle, string> = {
  card: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',
  compact: 'grid-cols-2 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10',
  icon: 'grid-cols-3 md:grid-cols-6 lg:grid-cols-10 xl:grid-cols-14',
};

/* ── 字母图标色板：12 色固定色板，按 seed 稳定取色（同站每次同色） ── */
export const LETTER_PALETTE: readonly string[] = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#64748b',
];

/** FNV-1a：稳定哈希（同输入每次结果一致） */
export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 从色板按 seed 稳定取一个颜色 */
export function paletteColor(seed: string): string {
  return LETTER_PALETTE[hashSeed(seed) % LETTER_PALETTE.length];
}

/* ── 复用类名组合（对齐 legacy 卡片/胶囊样式） ── */

/** 卡片外壳：legacy renderLinkCard 的边框/阴影/悬停抬升 */
export const CARD_FRAME =
  'rounded-xl border border-slate-100 bg-white shadow-sm transition-all duration-200 ' +
  'hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-lg ' +
  'dark:border-slate-700/50 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-700/40';

/** 悬停标题变蓝（配合外层 group） */
export const TITLE_HOVER = 'transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400';

/** 分段控件（站内/站外胶囊、卡片视图切换）选中态 */
export const SEG_ACTIVE = 'bg-white text-blue-600 shadow-sm dark:bg-slate-600 dark:text-blue-400';
