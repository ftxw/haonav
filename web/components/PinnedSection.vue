<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import LinkCard from './LinkCard.vue';
import type { CardStyle, IconStrategy } from '../lib/models';
import type { IndexedLink } from '../stores/nav';

defineProps<{
  links: IndexedLink[];
  cardStyle: CardStyle;
  iconStrategy: IconStrategy;
  openInNewTab: boolean;
  gridClass: string;
}>();

const emit = defineEmits<{ context: [payload: { link: IndexedLink; x: number; y: number }] }>();
</script>

<template>
  <!-- 对齐 legacy：无外框，Pin 图标 + 大写间距标题 -->
  <section>
    <div class="mb-4 flex items-center gap-2">
      <AppIcon name="pin" :size="16" class="fill-current text-blue-500" />
      <h2 class="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">置顶 / 常用</h2>
      <span class="ml-auto text-xs text-slate-400 dark:text-slate-500">{{ links.length }}</span>
    </div>
    <div class="grid gap-3" :class="gridClass">
      <LinkCard
        v-for="l in links"
        :key="l.id"
        :link="l"
        :card-style="cardStyle"
        :icon-strategy="iconStrategy"
        :open-in-new-tab="openInNewTab"
        @context="emit('context', $event)"
      />
    </div>
  </section>
</template>
