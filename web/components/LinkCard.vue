<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CardStyle, IconStrategy } from '../lib/models';
import { linkLetterIcon } from '../lib/brandIcon';
import { CARD_FRAME, TITLE_HOVER } from '../lib/ui';
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

/** 三档共用的外壳（legacy 卡片边框/阴影/悬停抬升）+ 跳转属性 */
const shell = computed(() => [
  props.cardStyle === 'icon' ? 'hn-card-lite' : 'hn-card',
  CARD_FRAME,
  props.cardStyle === 'card' ? 'p-3' : 'p-2',
]);
const jump = computed(() => ({
  href: props.link.url,
  target: props.openInNewTab ? '_blank' : '_self',
  rel: props.openInNewTab ? 'noopener noreferrer' : undefined,
}));
</script>

<template>
  <!-- ── 详情档（两行：图标+标题 / 描述行） ── -->
  <a v-if="cardStyle === 'card'" :class="shell" :title="link.title" v-bind="jump" @contextmenu="onContext">
    <span class="mb-1.5 flex items-center gap-3">
      <img
        :src="src"
        :loading="loading"
        decoding="async"
        width="32"
        height="32"
        alt=""
        class="h-8 w-8 shrink-0 rounded-lg"
        @error="failed = true"
      />
      <span :class="['min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200', TITLE_HOVER]">{{
        link.title
      }}</span>
    </span>
    <span class="block h-4 w-full overflow-hidden text-xs text-slate-500 line-clamp-1 dark:text-slate-400">
      <template v-if="link.desc">{{ link.desc }}</template>
      <span v-else class="opacity-0">.</span>
    </span>
  </a>

  <!-- ── 简洁档（单行：图标+标题） ── -->
  <a v-else-if="cardStyle === 'compact'" :class="shell" :title="link.title" v-bind="jump" @contextmenu="onContext">
    <span class="flex items-center gap-2.5">
      <img
        :src="src"
        :loading="loading"
        decoding="async"
        width="24"
        height="24"
        alt=""
        class="h-6 w-6 shrink-0 rounded-lg"
        @error="failed = true"
      />
      <span :class="['min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200', TITLE_HOVER]">{{
        link.title
      }}</span>
    </span>
  </a>

  <!-- ── 纯图标档（悬停显示标题） ── -->
  <a
    v-else
    :class="[...shell, 'group relative flex aspect-square items-center justify-center']"
    :title="link.title"
    v-bind="jump"
    @contextmenu="onContext"
  >
    <img
      :src="src"
      :loading="loading"
      decoding="async"
      width="40"
      height="40"
      alt=""
      class="h-10 w-10 rounded-lg"
      @error="failed = true"
    />
    <span
      class="pointer-events-none absolute left-1/2 top-full z-30 mt-1 max-w-[12rem] -translate-x-1/2 truncate rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-slate-700"
      >{{ link.title }}</span
    >
  </a>
</template>
