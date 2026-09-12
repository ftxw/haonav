/**
 * 后台 UI 收敛模块：类名常量层（与前台 web/lib/ui.ts 对称）。
 *
 * 目标：6 个面板共用同一套「页面骨架 / 卡片 / 控件 / 语义标签 / 表格」样式，
 * 视觉语言与前台一致（玻璃面 + 主色走 --accent），做到「前后台像同一个产品的两个界面」。
 *
 * 约定：
 * - 类名必须是完整字面量，绝不 `xxx-${n}` 动态拼接（Tailwind 静态扫描会 purge）。
 * - 主色一律走 --accent（后台改色即时生效），不得出现写死的 emerald-*。
 * - 明暗两态都可用：玻璃面由 glass-surface 令牌提供，文字/边框用 dark: 变体。
 */

/* ═══════════════════════ 页面骨架 ═══════════════════════ */

/** 面板根容器：统一「标题区 → 工具栏 → 内容卡片」的纵向节奏 */
export const PAGE = 'space-y-4';

/** 页面标题区：微标签 + 大标题 + 右侧操作（各面板结构一致，切换不跳） */
export const PAGE_HEAD = 'flex flex-wrap items-end gap-3';

/** 标题区左侧文字块 */
export const PAGE_HEAD_MAIN = 'min-w-0';

/** 微标签（复刻前台 SECTION_LABEL 风格） */
export const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500';

/** 页面大标题 */
export const PAGE_TITLE = 'text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100';

/** 标题区 / 行内操作区（自动靠右） */
export const PAGE_ACTIONS = 'ml-auto flex flex-wrap items-center gap-2';

/* ═══════════════════════ 卡片 ═══════════════════════ */

/** 玻璃卡片（内容卡片 / 工具筛选卡片统一） */
export const CARD = 'glass-surface rounded-2xl';

/** 玻璃卡片 + 内边距（面板里最常用的一体写法） */
export const CARD_BOX = 'glass-surface rounded-2xl p-4';

/** 卡片内边距 */
export const CARD_PAD = 'p-4';

/** 卡片标题 */
export const CARD_TITLE = 'text-sm font-bold text-slate-800 dark:text-slate-100';

/** 卡片说明文字 */
export const CARD_DESC = 'mt-0.5 text-xs text-slate-500 dark:text-slate-400';

/** 卡片头部行（标题 + 计数 + 右侧操作） */
export const CARD_HEAD = 'flex flex-wrap items-center gap-2';

/** 卡片内的列表行（快照 / 重复组等） */
export const ROW_CARD =
  'flex items-center gap-2 rounded-lg bg-slate-900/[0.04] px-3 py-2 text-xs dark:bg-white/[0.06]';

/* ═══════════════════════ 表单控件 ═══════════════════════ */

/** 文本 / 数字输入：玻璃底 + accent 聚焦 */
export const INPUT =
  'w-full rounded-lg border border-slate-300/70 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder-slate-400 focus:border-accent dark:border-white/15 dark:bg-white/5 dark:text-slate-100';

/** 下拉框（与 INPUT 同款） */
export const SELECT = INPUT;

/** 表单标签 */
export const LABEL = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';

/** 多列栅格行（品牌 / 外观 / 备份策略等） */
export const FORM_ROW = 'grid gap-3 sm:grid-cols-3';

/* ═══════════════════════ 按钮 ═══════════════════════ */

const BTN_BASE =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

/** 主操作（主色，走 --accent） */
export const BTN_PRIMARY = BTN_BASE + ' bg-accent text-white hover:brightness-110';

/** 主操作 · 大号（面板底部的保存类按钮，px-4 py-2 text-sm） */
export const BTN_PRIMARY_LG =
  'inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50';

/** 次要操作（玻璃中性底） */
export const BTN_SECONDARY =
  BTN_BASE + ' bg-slate-900/[0.06] text-slate-700 hover:bg-slate-900/[0.1] dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15';

/** 危险操作 */
export const BTN_DANGER = BTN_BASE + ' bg-red-500 text-white hover:bg-red-600';

/** 行内文字动作（表内编辑 / 恢复等） */
export const LINK_BTN = 'text-xs text-accent hover:underline';
export const LINK_DANGER = 'text-xs text-red-500 hover:underline';

/* ═══════════════════════ 语义标签 ═══════════════════════ */

const TAG_BASE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium';

/** 成功 / 新增 / 已有（走主色） */
export const TAG_OK = TAG_BASE + ' bg-accent/15 text-accent';

/** 警告 / 冲突 */
export const TAG_WARN = TAG_BASE + ' bg-amber-500/15 text-amber-600 dark:text-amber-400';

/** 危险 / 失效 */
export const TAG_DANGER = TAG_BASE + ' bg-red-500/15 text-red-600 dark:text-red-400';

/** 中性 / 计数 */
export const TAG_NEUTRAL = TAG_BASE + ' bg-slate-900/[0.06] text-slate-500 dark:bg-white/10 dark:text-slate-400';

/* ═══════════════════════ 表格 ═══════════════════════ */

export const TABLE_WRAP = 'glass-surface overflow-hidden rounded-2xl';
export const TABLE = 'w-full border-collapse';
export const THEAD = 'bg-slate-900/[0.03] dark:bg-white/[0.05]';
export const TH = 'px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap';
export const TD = 'px-3 py-2 text-sm text-slate-700 dark:text-slate-200';
export const ROW = 'border-t border-slate-100 transition-colors hover:bg-white/40 dark:border-white/10 dark:hover:bg-white/5';
