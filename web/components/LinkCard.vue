<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CardStyle, IconStrategy } from '../lib/models';
import { linkIconUrl, linkLetterIcon } from '../lib/brandIcon';
import { CARD_FRAME, CARD_MIN_H, ICON_RADIUS, TITLE_HOVER } from '../lib/ui';
import type { IndexedLink } from '../stores/nav';

const props = defineProps<{
  link: IndexedLink;
  cardStyle: CardStyle;
  iconStrategy: IconStrategy;
  openInNewTab: boolean;
  /** 站点设置的图标服务地址（`settings.iconApi`）；缺省时回退出厂默认 */
  iconApi?: string;
}>();

const emit = defineEmits<{ context: [payload: { link: IndexedLink; x: number; y: number }] }>();

const failed = ref(false);

/** 本地字母图标（data URI，零请求） */
const letterSrc = computed(() => linkLetterIcon(props.link.title, props.link.url));

/** 自定义图标：对齐 workers.js —— icon 非空且以 http(s) 开头才采用 */
const custom = computed(() => {
  const v = props.link.icon;
  return v && /^https?:\/\//i.test(v) ? v : '';
});

/**
 * 自动抓取：直连站点设置的图标服务（默认 api.xinac.net，方案 B）。
 * Makers 边缘函数禁止写 CDN 缓存（caches.default 抛 forbidden cdn cache），
 * 代理既拿不到缓存、又徒增边缘计算，故改浏览器直连。
 * 默认服务自带 `Cache-Control: public, max-age=604800` + CORS `*`，浏览器缓存 7 天。
 * 加载失败由下方 @error 切到字母图标兜底。
 */
const auto = computed(() => linkIconUrl(props.link.url, props.iconApi));

/**
 * 图标取值优先级（对齐 `workers.js`：`(!icon || !icon.startsWith('http')) ? imgApi + url : icon`）：
 *  - `letter` 策略的语义是「只用本地字母图标、零请求」→ **刻意忽略自定义图标**；
 *    自定义 URL 只在 `fetched` 模式下才优先于自动抓取。
 *  - `fetched`：自定义 URL 优先，其次自动抓取，最后字母回退。
 *  - `failed`（当前图标加载失败）→ 回退字母图标，避免破图。
 * 不追加 `v=<hash>` 之类的 cache-buster：xinac 自带 Cache-Control 一年，浏览器缓存，无需 cache-buster。
 */
const src = computed(() => {
  if (props.iconStrategy !== 'fetched' || failed.value) return letterSrc.value;
  return custom.value || auto.value || letterSrc.value;
});

const loading = computed(() => (props.iconStrategy === 'fetched' ? 'lazy' : undefined));

/** 链接或图标变化 → 重置失败态，让编辑后的新图标重新尝试加载 */
watch([() => props.link.url, () => props.link.icon], () => {
  failed.value = false;
});

function onContext(e: MouseEvent): void {
  e.preventDefault();
  emit('context', { link: props.link, x: e.clientX, y: e.clientY });
}

/** 卡片档外壳：玻璃面 + 最小高度 + 内边距 + 跳转属性；group 让两档都有悬停主色标题 */
const shellCard = computed(() => ['hn-card', 'group', CARD_FRAME, 'flex flex-col p-2.5', CARD_MIN_H]);
/** 纯图标档外壳：静止态无卡片（仅图标）；尺寸与卡片档高度一致（88px）。
    外壳只负责整体上浮 + 定位；圆角与阴影都在 img 上（同一盒子），
    阴影自动跟随圆角 —— 改圆角时阴影一起变，不会两层不一致 */
const shellIcon = computed(() => [
  'group',
  'cursor-pointer',
  'h-[88px] w-[88px] justify-self-center',
  'relative flex items-center justify-center',
  'transition-all duration-300',
  'hover:-translate-y-0.5',
]);
const jump = computed(() => ({
  href: props.link.url,
  target: props.openInNewTab ? '_blank' : '_self',
  rel: props.openInNewTab ? 'noopener noreferrer' : undefined,
}));
</script>

<template>
  <!-- ── 详情档（两行：图标+标题 / 描述行） ── -->
  <a v-if="cardStyle === 'card'" :class="shellCard" :title="link.title" v-bind="jump" @contextmenu="onContext">
    <span class="mb-1.5 flex items-center gap-3">
      <img
        :src="src"
        :loading="loading"
        decoding="async"
        width="32"
        height="32"
        alt=""
        class="h-8 w-8 shrink-0 rounded-lg transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110"
        @error="failed = true"
      />
      <span :class="['min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100', TITLE_HOVER]">{{
        link.title
      }}</span>
    </span>
    <span class="block h-4 w-full overflow-hidden text-xs text-slate-600 line-clamp-1 dark:text-slate-400">
      <template v-if="link.desc">{{ link.desc }}</template>
      <span v-else class="opacity-0">.</span>
    </span>
  </a>

  <!-- ── 纯图标档：仅图标本身（无卡片），填满网格单元并居中，标题悬停显示 ── -->
  <a
    v-else
    :class="shellIcon"
    :title="link.title"
    v-bind="jump"
    @contextmenu="onContext"
  >
    <img
      :src="src"
      :loading="loading"
      decoding="async"
      alt=""
      :class="[
        'h-full w-full object-contain transition-all duration-300 group-hover:shadow-lg group-hover:shadow-accent/20',
        ICON_RADIUS,
      ]"
      @error="failed = true"
    />
    <span
      class="pointer-events-none absolute left-1/2 top-full z-30 mt-1 max-w-[12rem] -translate-x-1/2 truncate rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-700"
      >{{ link.title }}</span
    >
  </a>
</template>
