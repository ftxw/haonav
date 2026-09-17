/**
 * UI 收敛模块：两档卡片网格（card / icon）、字母图标色板、跨组件复用的类名组合。
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
/** 图标档圆角（单一来源）：直接加在 <img> 上，box-shadow 会自动跟随它 —— 改这里即同时改图标与阴影的圆角。
    可用档位：rounded-xl .75rem(12px) / rounded-2xl 1rem(16px) / rounded-3xl 1.5rem(24px) */
export const ICON_RADIUS = 'rounded-2xl';

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
 * 悬停过渡（单一来源）：**对称 300ms** —— 进入与移开同速。
 * 移开后的「慢慢恢复」是刻意保留的手感（目录卡与链接卡都要），不要改成快速回落。
   ⚠️ 注释里**不要**写出任何类名原样字符串（过渡 / 间距 / 颜色都一样）—— Tailwind v4 的
      扫描器不区分注释与代码，注释里出现的候选类名一样会被生成进产物（已实测踩到两次：
      类名在源码里删干净了，产物里还在；撤销方案时又被注释里的旧类名重新生成出来）。
 */
export const HOVER_TRANSITION = 'transition-all duration-300';

/** 图标悬停（链接卡图标 / 侧栏目录项 / 品牌 logo 三处共用，必须一致）：缩放 + 微旋转 */
export const ICON_HOVER = 'transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110';

/** 左右两卡头部等高（68px = 右侧搜索卡实际高度：p-4 上下各 16px + 搜索框 h-9 36px）。
    两卡都从 app-shell 顶部起算，所以头部等高 → 左卡分割线与右卡底边对齐。
    ⚠️ 用 min-h 不用固定 h：TopBar 是 flex-wrap，窄屏换行时不能被压扁。 */
export const HEAD_H = 'min-h-[68px]';
/** 左卡品牌行（= 头部高度 + 与右卡相同的横向节奏） */
export const HEAD_ROW = 'flex ' + HEAD_H + ' shrink-0 items-center gap-3';

/**
 * 链接卡片外壳 —— 材质**统一走 glass-surface**（与左卡 / 搜索卡 / 弹窗同款），
 * 不再手写 bg / border：手写配方会和 `--glass-*` 令牌各走一套，改主题或调玻璃质感时
 * 只对一半生效（历史上就是这么跑偏的）。圆角 16px（rounded-2xl）与站内其他卡片一致。
 * 静止态：glass-surface 提供底色 / 边框 / 阴影 / 模糊（明暗两套在 :root / html.dark）。
 * 悬停态：上浮 + 边框转主色 + 阴影带主色光晕 + 背景提亮一档（明暗量级一致）。
 */
export const CARD_FRAME =
  'group cursor-pointer rounded-2xl glass-surface ' +
  HOVER_TRANSITION +
  ' hover:-translate-y-0.5 hover:shadow-lg ' +
  // 悬停：明暗两套阴影量级一致（都是 shadow-lg），边框统一变绿与背景光晕呼应
  'hover:bg-white/80 hover:border-accent/50 hover:shadow-accent/20 ' +
  'dark:hover:bg-white/[0.12] dark:hover:border-accent/50 dark:hover:shadow-accent/20';

/** 悬停标题变色（配合外层 group）—— 主色走 --accent，后台改色实时生效 */
export const TITLE_HOVER = 'transition-colors group-hover:text-accent';

/** 分段控件（设置弹层内）选中态 —— 主色走 --accent，后台可改色 */
export const SEG_ACTIVE = 'bg-white text-accent shadow-sm dark:bg-white/15 dark:text-accent';

/** 毛玻璃顶栏 / 弹层 / 侧栏（玻璃面统一令牌，明暗两套集中在 :root / html.dark） */
export const GLASS = 'glass-surface';

/** 区块小标签：全大写、宽字距、低对比（「分类目录」「置顶 / 常用」等 kicker） */
export const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500';

/** 侧栏项选中态：材质与链接卡片静止态同为 glass-surface（改 --glass-* 即两边同步），
    仅圆角小一档 —— 导航项只有 36px 高，16px 圆角会显得过圆；也不悬浮。
    发光小圆点（绿）作选中指示。 */
export const PILL_ACTIVE =
  'rounded-xl glass-surface font-medium text-slate-700 ' +
  HOVER_TRANSITION +
  ' dark:text-slate-100';

/** 侧栏项空闲态：默认完全透明（无背景、无边框、无模糊），仅文字可见；悬停 = 链接卡片「悬停态」
    （glass-surface 材质 + accent 绿边 / shadow-lg 绿光晕 / 轻微上浮，深色背景提亮一档） */
export const PILL_IDLE =
  'rounded-xl border-[0.5px] border-transparent text-slate-600 dark:text-slate-400 ' +
  HOVER_TRANSITION +
  ' ' +
  'hover:glass-surface dark:hover:bg-white/[0.12] ' +
  'hover:border-accent/50 dark:hover:border-accent/50 ' +
  'hover:shadow-lg hover:shadow-accent/20 dark:hover:shadow-lg dark:hover:shadow-accent/20 ' +
  'hover:-translate-y-0.5';

/* ── 卡片外壳令牌（与后台 admin/lib/adminUi.ts 同一套视觉语言）──
   后台的 SHELL_CARD 是「rounded-2xl + 细边框 + 半透白底 + shadow-sm + glass-blur」；
   前台对应的材质入口是 glass-surface（同一套 --glass-* 令牌：底色 / 边框 / 阴影 / 模糊），
   所以这里只需补圆角即可，两者渲染结果同档。
   ⚠️ 令牌**不能**直接 import 后台那份：admin/lib/adminUi.ts 只被后台的 @source 扫到，
   前台产物里不会生成那些类名（Tailwind 对扫不到的类名不报错）。同理，这里也禁止写
   backdrop-blur-*，模糊一律走 glass-surface / glass-blur（值 = --glass-blur）。 */

/** 独立浮起的外壳卡（左列目录卡 / 右侧搜索卡 / 各内容卡） */
export const SHELL_CARD = 'rounded-2xl glass-surface';

/** 卡片标题行（带底部分割线）：与后台 CARD_HEAD_BAR 同规格（min-h-14 + px-4） */
export const CARD_HEAD_BAR =
  'flex min-h-14 shrink-0 flex-wrap items-center gap-2.5 border-b border-slate-200/70 px-4 dark:border-white/10';

/** 卡片标题（与后台 CARD_TITLE 同规格：16px 粗体） */
export const CARD_TITLE = 'text-base font-bold text-slate-800 dark:text-slate-100';

/**
 * 区块标题行（**没有卡片外壳**时用）—— 链接列表已改为「每个链接自己一张卡」，
 * 外层不再有整体大卡，标题行若沿用卡片规格（min-h-14 + border-b + px-4）就会变成
 * 一条悬空的分割线，所以这里去掉高度与分割线，只留「图标 + 标题 + 计数」一行
 * 和与下方网格的间距（mb-3，与站内 12px 间距同档）。
 */
export const SECTION_HEAD_BAR =
  'mb-3 flex flex-wrap items-center gap-2.5 border-b border-slate-200/70 pb-2.5 dark:border-white/10';

/** 卡片内边距（16px = rounded-2xl 的半径，四周留白最平衡），与后台 CARD_PAD 一致 */
export const CARD_PAD = 'p-4';

/** 等宽小标签（计数 / 技术标签） */
export const CHIP =
  'inline-flex items-center rounded-md bg-slate-900/[0.06] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-500 dark:bg-white/[0.08] dark:text-slate-400';
