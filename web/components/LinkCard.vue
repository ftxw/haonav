<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CardStyle, IconStrategy } from '../lib/models';
import { linkLetterIcon } from '../lib/brandIcon';
import { CARD_FRAME, CARD_MIN_H, TITLE_HOVER } from '../lib/ui';
import type { IndexedLink } from '../stores/nav';

const props = defineProps<{
  link: IndexedLink;
  cardStyle: CardStyle;
  iconStrategy: IconStrategy;
  openInNewTab: boolean;
}>();

const emit = defineEmits<{ context: [payload: { link: IndexedLink; x: number; y: number }] }>();

const failed = ref(false);

/** 图标零请求：letter 策略用本地生成的字母 SVG；fetched 才走 /api/icon 并在失败时回退 */
const letterSrc = computed(() => linkLetterIcon(props.link.title, props.link.url));
const src = computed(() =>
  props.iconStrategy === 'fetched' && props.link.icon && !failed.value ? props.link.icon : letterSrc.value,
);
const loading = computed(() => (props.iconStrategy === 'fetched' ? 'lazy' : undefined));

function onContext(e: MouseEvent): void {
  e.preventDefault();
  emit('context', { link: props.link, x: e.clientX, y: e.clientY });
}

/** 卡片档外壳：玻璃面 + 最小高度 + 内边距 + 跳转属性；group 让两档都有悬停主色标题 */
const shellCard = computed(() => ['hn-card', 'group', CARD_FRAME, 'flex flex-col p-2.5', CARD_MIN_H]);
/** 纯图标档外壳：静止态无卡片（仅图标）；尺寸与卡片档高度一致（88px）。
    悬停只保留与卡片一致的「图标放大 scale-110（在 img 上）+ 绿光晕阴影」，无边框、不上浮 */
const shellIcon = computed(() => [
  'group',
  'cursor-pointer',
  'h-[88px] w-[88px] justify-self-center',
  'relative flex items-center justify-center',
  'rounded-xl',
  'transition-all duration-300',
  'hover:shadow-lg hover:shadow-accent/20',
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
      class="h-full w-full object-contain transition-transform duration-300 group-hover:scale-110"
      @error="failed = true"
    />
    <span
      class="pointer-events-none absolute left-1/2 top-full z-30 mt-1 max-w-[12rem] -translate-x-1/2 truncate rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-700"
      >{{ link.title }}</span
    >
  </a>
</template>
