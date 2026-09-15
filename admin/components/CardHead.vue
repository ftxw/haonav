<script setup lang="ts">
import { CARD_DESC, CARD_HEAD_BAR, CARD_TITLE } from '../lib/adminUi';

/**
 * 子卡片统一标题行（带分割线）—— 全后台卡片都长成「链接列表」那样。
 * 结构：大标题（+ 可选简介，**简介在分割线上方**）+ 右侧计数 / 操作插槽。
 * 右侧操作走默认插槽（没内容时整块不渲染）。
 *
 * 注：`desc` 保留为可选能力 —— 用户已判定各卡片简介「意义不大」并全部撤下，
 * 故当前调用方都不再传 desc；将来若某张卡确有需要，传上即可。
 */
defineProps<{ title: string; desc?: string; count?: string | number }>();
</script>

<template>
  <div :class="CARD_HEAD_BAR">
    <div class="min-w-0 flex-1">
      <h3 :class="CARD_TITLE">{{ title }}</h3>
      <p v-if="desc" :class="CARD_DESC">{{ desc }}</p>
    </div>
    <span v-if="count !== undefined && count !== ''" class="shrink-0 text-xs text-slate-500">{{ count }}</span>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2">
      <slot />
    </div>
  </div>
</template>
