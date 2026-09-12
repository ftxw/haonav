/**
 * UI 收敛模块：三档卡片网格、字母图标色板、跨组件复用的类名组合。
 * 网格类名必须是完整字面量 —— 绝不能 `grid-cols-${n}` 拼接（Tailwind 静态扫描会 purge）。
 * 视觉基准：v1-legacy（git show v1-legacy:App.tsx）。
 */
import type { CardStyle } from './models';

/* ── 卡片网格：card 正常卡片 / icon 纯图标（两档外框高度一致）── */
export const GRID: Record<CardStyle, string> = {
  card: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8',
  // 图标档格子自适应成接近正方形的宽度（最小 112px，容纳 88px 外框 + 呼吸空间）
  icon: 'grid-cols-[repeat(auto-fill,minmax(112px,1fr))]',
};

/** 卡片基准高度（px）：卡片档的最小高度，同时也是图标档正方形的边长 —— 两档外框高度一致 */
export const CARD_H_PX = 88;
/** 卡片档：最小高度（内容被 truncate/line-clamp 约束，实际高度即 CARD_H_PX） */
export const CARD_MIN_H = 'min-h-[88px]';
/** 图标档：与卡片档同高的正方形外框，在网格单元内居中 */
export const CARD_ICON_BOX = 'h-[88px] w-[88px] justify-self-center';

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

/* ── 复用类名组合（亮色 = 参考站「logo 卡片」样式；深色 = 参考站「玻璃卡」样式） ── */

/**
 * 卡片外壳（明暗两套配方）：
 * - 亮色：参考项目顶部 logo 卡片（bg-white/50 + border-slate-200/50，
 *   hover:bg-white hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5）
 * - 深色：参考站内容玻璃卡（bg-white/[0.06] + border-white/15 + backdrop-blur，
 *   hover:bg-white/[0.12] hover:border-white/25）—— logo 卡片在深色下是透明的，
 *   直接照抄会导致内容卡片不可见、悬停变死黑
 */
export const CARD_FRAME =
  'group cursor-pointer rounded-xl border backdrop-blur-md bg-white/50 border-slate-200/50 ' +
  'dark:bg-white/[0.06] dark:border-white/15 ' +
  'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ' +
  // 悬停：明暗两套阴影量级一致（都是 shadow-lg），边框统一变绿与背景光晕呼应
  'hover:bg-white hover:border-accent hover:shadow-accent/20 ' +
  'dark:hover:bg-white/[0.12] dark:hover:border-accent dark:hover:shadow-accent/20';

/** 悬停标题变色（配合外层 group）—— 主色走 --accent，后台改色实时生效 */
export const TITLE_HOVER = 'transition-colors group-hover:text-accent';

/** 分段控件（设置弹层内）选中态 —— 主色走 --accent，后台可改色 */
export const SEG_ACTIVE = 'bg-white text-accent shadow-sm dark:bg-white/15 dark:text-accent';

/** 毛玻璃顶栏 / 弹层 / 侧栏（玻璃面统一令牌，明暗两套集中在 :root / html.dark） */
export const GLASS = 'glass-surface';

/** 区块小标签：全大写、宽字距、低对比（「分类目录」「置顶 / 常用」等 kicker） */
export const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500';

/** 侧栏项选中态：完全对齐链接卡片的「深色玻璃 / 浅色白卡」静止样式（圆角、边框、底色一致），
    仅不悬浮；发光小圆点（绿）作选中指示。深色下用 bg-white/[0.06]+border-white/15，
    与链接卡片深色静止态完全相同，不再用死黑的 slate-800 */
export const PILL_ACTIVE =
  'rounded-xl border border-slate-200/50 bg-white font-medium text-slate-700 ' +
  'transition-all duration-300 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-100';

/** 侧栏项空闲态：默认透明；悬停 = 链接卡片的悬停（圆角、绿边框、绿光晕、轻微上浮完全一致）。
    明暗两套悬停阴影量级一致（都是 shadow-lg），与链接卡片悬停动效统一 */
export const PILL_IDLE =
  'rounded-xl border border-transparent text-slate-600 dark:text-slate-400 transition-all duration-300 ' +
  'hover:bg-white dark:hover:bg-white/[0.12] ' +
  'hover:border-accent dark:hover:border-accent ' +
  'hover:shadow-lg hover:shadow-accent/20 dark:hover:shadow-lg dark:hover:shadow-accent/20 ' +
  'hover:-translate-y-0.5';

/** 等宽小标签（计数 / 技术标签） */
export const CHIP =
  'inline-flex items-center rounded-md bg-slate-900/[0.06] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-500 dark:bg-white/[0.08] dark:text-slate-400';
