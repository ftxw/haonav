<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import LinkCard from './LinkCard.vue';
import { SECTION_LABEL } from '../lib/ui';
import type { CardStyle, IconStrategy } from '../lib/models';
import type { IndexedLink } from '../stores/nav';

defineProps<{
  links: IndexedLink[];
  cardStyle: CardStyle;
  iconStrategy: IconStrategy;
  openInNewTab: boolean;
  gridClass: string;
  /** 站点设置的图标服务地址（`settings.iconApi`） */
  iconApi?: string;
}>();

const emit = defineEmits<{ context: [payload: { link: IndexedLink; x: number; y: number }] }>();
</script>

<template>
  <!-- 玻璃语言：与分类区完全一致的表头（图标 + 大标题 + 计数小标签 + 分隔线） -->
  <section>
    <div class="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-white/10">
      <AppIcon name="pin" :size="22" class="text-slate-400 dark:text-slate-500" />
      <h2 class="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">置顶链接</h2>
      <span :class="SECTION_LABEL">{{ links.length }}</span>
    </div>
    <div class="grid gap-3" :class="gridClass">
      <LinkCard
        v-for="l in links"
        :key="l.id"
        :link="l"
        :card-style="cardStyle"
        :icon-strategy="iconStrategy"
        :open-in-new-tab="openInNewTab"
        :icon-api="iconApi"
        @context="emit('context', $event)"
      />
    </div>
  </section>
</template>
