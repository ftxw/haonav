/**
 * UI 收敛模块：三档卡片网格、字母图标色板、跨组件复用的类名组合。
 * 网格类名必须是完整字面量 —— 绝不能 `grid-cols-${n}` 拼接（Tailwind 静态扫描会 purge）。
 * 视觉基准：v1-legacy（git show v1-legacy:App.tsx）。
 */
import type { CardStyle } from './models';

/* ── 卡片网格：card 正常卡片 / icon 纯图标（两档，卡片高度一致）── */
export const GRID: Record<CardStyle, string> = {
  card: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',
  icon: 'grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10',
};

/** 卡片外壳最小高度：两档共用，保证切换视图时布局不跳动 */
export const CARD_MIN_H = 'min-h-[104px]';

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

/* ── 复用类名组合（对齐 nav.lts.cc 参考站） ── */

/** 卡片外壳：半透明 + emerald 柔光阴影 + 悬停抬升（规格④） */
export const CARD_FRAME =
  'rounded-xl border border-slate-200/50 bg-white/50 transition-all duration-300 ' +
  'hover:-translate-y-0.5 hover:border-slate-300/60 hover:bg-white hover:shadow-md hover:shadow-emerald-500/10 ' +
  'dark:border-transparent dark:bg-transparent dark:hover:border-slate-700/60 dark:hover:bg-slate-800';

/** 悬停标题变色（配合外层 group） */
export const TITLE_HOVER = 'transition-colors group-hover:text-emerald-600 dark:group-hover:text-emerald-400';

/** 分段控件（设置弹层内：主题三态 / 视图三选）选中态 —— 主色走 --accent，后台可改色 */
export const SEG_ACTIVE = 'bg-white text-accent shadow-sm dark:bg-slate-700 dark:text-emerald-400';

/** 毛玻璃顶栏 / 弹层（规格③） */
export const GLASS =
  'bg-gray-100/60 dark:bg-[#0f172a]/60 backdrop-blur-xl border-slate-200/40 dark:border-slate-700/40';
