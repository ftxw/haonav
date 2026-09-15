/**
 * 后台 UI 收敛模块：类名常量层（与前台 web/lib/ui.ts 对称）。
 *
 * 目标：6 个面板共用同一套「页面骨架 / 卡片 / 控件 / 语义标签 / 表格」样式，
 * 视觉语言与前台一致（玻璃面 + 主色走 --accent），做到「前后台像同一个产品的两个界面」。
 *
 * 约定：
 * - 类名必须是完整字面量，绝不 `xxx-${n}` 动态拼接（Tailwind 静态扫描会 purge）。
 * - 主色一律走 --accent（后台改色即时生效），不得出现写死的 emerald-*。
 * - 明暗两态都可用：内容面由「白底 + 浅边 + 圆角」的 SURFACE 提供，文字/边框用 dark: 变体。
 */

/* ═══════════════════════ 页面骨架 ═══════════════════════ */

/**
 * 画布上独立浮起的「外壳卡片」：左侧导航卡 / 左下账户卡 / 右侧页面标题卡。
 * 与面板内层 SURFACE 同一语言，只是背景更透、带背景模糊，让画布主色透出来。
 */
export const SHELL_CARD =
  'rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.05]';

/**
 * 面板根容器：统一「标题卡 → 工具栏 → 内容卡片」的纵向节奏。
 * 卡片间距与左侧列一致：小屏 12px、lg 起 20px（左侧两卡是 `lg:gap-5`）。
 */
export const PAGE = 'space-y-4 lg:space-y-5';

/**
 * 页面标题卡：微标签 + 大标题 + 说明（由 PageHead 组件消费）+ 右侧操作。
 * 内边距与其它卡片统一走 `p-4`（16px = 卡片圆角 rounded-2xl 的半径，视觉最平衡）。
 */
export const PAGE_HEAD = SHELL_CARD + ' flex flex-wrap items-center gap-3 p-4';

/** 标题区左侧文字块 */
export const PAGE_HEAD_MAIN = 'min-w-0';

/** 微标签（复刻前台 SECTION_LABEL 风格） */
export const SECTION_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500';

/** 页面大标题（参考图：内容区顶部的大号粗标题） */
export const PAGE_TITLE = 'text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100';

/** 标题区 / 行内操作区（自动靠右） */
export const PAGE_ACTIONS = 'ml-auto flex flex-wrap items-center gap-2';

/* ═══════════════════════ 侧栏导航 ═══════════════════════ */

/** 导航行基础（图标 + 文本 + 圆角）；选中 / 空闲态由调用方拼接 */
export const NAV_ITEM = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ';

/** 导航选中态：实心主色 + 白字（参考图侧栏选中项 = 主色实心圆角块） */
export const NAV_ACTIVE = 'bg-accent font-medium text-white shadow-sm shadow-accent/30';

/** 导航空闲态 */
export const NAV_IDLE =
  'text-slate-600 hover:bg-slate-900/[0.05] hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.07] dark:hover:text-white';

/* ═══════════════════════ 卡片 ═══════════════════════ */

/**
 * 面板内容面（参考图：白底 + 极浅边框 + 圆角 + 微阴影）。
 * 外壳（App.vue 的圆角应用框）已提供玻璃底，内层面用实底更清爽、层级更清楚。
 */
const SURFACE =
  'rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/[0.04]';

/** 内容卡片 / 工具筛选卡片统一 */
export const CARD = SURFACE;

/** 卡片内边距（16px）：与卡片圆角 `rounded-2xl`（16px）等值，四周留白最平衡。 */
export const CARD_PAD = 'p-4';

/**
 * 卡片标题行（带底部分割线）—— 所有子卡片统一走 `CardHead.vue` 消费本令牌。
 * `min-h-14` + `px-4`：与卡片正文的 `p-4` 同列，保证标题与正文左对齐、分割线通栏。
 */
export const CARD_HEAD_BAR =
  'flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-slate-200/70 px-4 dark:border-white/10';

/** 卡片标题（面板内各级卡片的主题字；用户要求「这类标题字都放大」→ 14px → 16px） */
export const CARD_TITLE = 'text-base font-bold text-slate-800 dark:text-slate-100';

/** 卡片说明文字 */
export const CARD_DESC = 'mt-0.5 text-xs text-slate-500 dark:text-slate-400';

/** 卡片头部行（标题 + 计数 + 右侧操作） */
export const CARD_HEAD = 'flex flex-wrap items-center gap-2';

/** 卡片内的列表行（快照 / 重复组等） */
export const ROW_CARD =
  'flex items-center gap-2 rounded-lg bg-slate-900/[0.04] px-3 py-2 text-xs dark:bg-white/[0.06]';

/* ═══════════════════════ 表单控件 ═══════════════════════ */

/**
 * 字段外观（**不含宽度**）。需要自定义宽度的场景用本令牌 + `w-*` 拼接，**不要用 INPUT**：
 * INPUT 自带 `w-full`，两者同属 width 工具类，产物里 `w-full` 排在更后面会把它盖掉
 * （Tailwind 按产物顺序决胜负，不按 class 书写顺序 —— 实测 `.w-full` 偏移 11814 > `.w-56` 11577）。
 * 后果：追加的 `w-*` 静默失效、控件撑满整行（历史 bug：筛选栏控件全宽换行/“太长”）。
 */
export const INPUT_BASE =
  'rounded-lg border border-slate-300/70 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder-slate-400 focus:border-accent dark:border-white/15 dark:bg-white/5 dark:text-slate-100';

/** 文本 / 数字输入：默认撑满容器（表单场景）；需要定宽时改用 INPUT_BASE */
export const INPUT = 'w-full ' + INPUT_BASE;

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

/** 无底色危险操作（顶栏「退出登录」）：平时是中性 ghost，悬停才转红 —— 不与主操作抢注意力 */
export const BTN_GHOST_DANGER =
  BTN_BASE +
  ' text-slate-500 hover:bg-red-500/10 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-400';

/** 行内文字动作（表内编辑 / 恢复等） */
export const LINK_BTN = 'text-xs text-accent hover:underline';
export const LINK_DANGER = 'text-xs text-red-500 hover:underline';

/* ═══════════════════════ 语义标签 ═══════════════════════ */

const TAG_BASE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium';

/** 成功 / 新增 / 已有（走主色） */
export const TAG_OK = TAG_BASE + ' bg-accent/15 text-accent';

/** 信息（蓝）：区别于主色的中性提示 */
export const TAG_INFO = TAG_BASE + ' bg-sky-500/15 text-sky-600 dark:text-sky-400';

/** 警告 / 冲突 */
export const TAG_WARN = TAG_BASE + ' bg-amber-500/15 text-amber-600 dark:text-amber-400';

/** 危险 / 失效 */
export const TAG_DANGER = TAG_BASE + ' bg-red-500/15 text-red-600 dark:text-red-400';

/** 中性 / 计数 */
export const TAG_NEUTRAL = TAG_BASE + ' bg-slate-900/[0.06] text-slate-500 dark:bg-white/10 dark:text-slate-400';

/* ═══════════════════════ 表格 ═══════════════════════ */

export const TABLE_WRAP = SURFACE + ' overflow-hidden';
export const TABLE = 'w-full border-collapse';
export const THEAD = 'border-b border-slate-200/80 dark:border-white/10';
export const TH = 'px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap';
export const TD = 'px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200';
export const ROW = 'border-t border-slate-100 transition-colors hover:bg-slate-900/[0.02] dark:border-white/[0.06] dark:hover:bg-white/[0.03]';
