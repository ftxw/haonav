<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import { CARD_HEAD_BAR, CARD_TITLE } from '../lib/ui';

/**
 * 前台子卡片标题行 —— admin/components/CardHead.vue 的同规格孪生件。
 * 结构：图标（可选）+ 标题 + 右侧计数 / 操作插槽，底部一条分割线。
 *
 * 为什么复制一份而不是直接复用后台组件：后台那份的类名令牌在 admin/lib/adminUi.ts，
 * 只被 admin/styles/admin.css 的 @source 扫到；前台产物不会生成它们（静默丢失、不报错）。
 * 两边共用 web/lib/ui.ts 里同规格的 CARD_HEAD_BAR / CARD_TITLE 令牌，视觉保持一致。
 */
defineProps<{ title: string; icon?: string; count?: string | number }>();
</script>

<template>
  <div :class="CARD_HEAD_BAR">
    <AppIcon v-if="icon" :name="icon" :size="20" class="text-slate-400 dark:text-slate-500" />
    <h3 class="min-w-0 flex-1 truncate" :class="CARD_TITLE">{{ title }}</h3>
    <span v-if="count !== undefined" class="shrink-0 text-xs text-slate-500 dark:text-slate-400">{{ count }}</span>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2">
      <slot />
    </div>
  </div>
</template>
