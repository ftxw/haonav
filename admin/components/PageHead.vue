<script setup lang="ts">
import { computed } from 'vue';
import { PAGE_ACTIONS, PAGE_HEAD, PAGE_HEAD_MAIN, PAGE_TITLE, SECTION_LABEL } from '../lib/adminUi';
import { panelMeta } from '../lib/panels';
import type { PanelId } from '../lib/adminStore';

/**
 * 面板标题卡（6 个面板共用）。
 *
 * 文字**全部**由 `lib/panels.ts` 的 PANEL_GROUPS 派生 ——
 * 微标签 = 左侧一级分类（站点内容 / 数据与备份 / 系统设置），
 * 大标题 = 左侧二级分类（链接 / 分类 / 搜索 / 数据 / 备份 / 设置），
 * 说明文字同源。改左侧名字，这里自动跟着变；右侧操作走默认插槽。
 */
const props = defineProps<{ panel: PanelId }>();
const meta = computed(() => panelMeta(props.panel));
</script>

<template>
  <div :class="PAGE_HEAD">
    <div :class="PAGE_HEAD_MAIN">
      <span :class="SECTION_LABEL">{{ meta.group }}</span>
      <h2 :class="PAGE_TITLE">{{ meta.label }}</h2>
      <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{{ meta.desc }}</p>
    </div>
    <div v-if="$slots.default" :class="PAGE_ACTIONS">
      <slot />
    </div>
  </div>
</template>
