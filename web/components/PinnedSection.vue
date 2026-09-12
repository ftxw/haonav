<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import LinkCard from './LinkCard.vue';
import { CHIP, SECTION_LABEL } from '../lib/ui';
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
  <!-- 玻璃语言：Pin 图标 + 微标签标题 + 等宽计数（无外框，对齐 legacy） -->
  <section>
    <div class="mb-4 flex items-center gap-2">
      <AppIcon name="pin" :size="16" class="fill-current text-accent" />
      <h2 :class="SECTION_LABEL">置顶 / 常用</h2>
      <span class="ml-auto" :class="CHIP">{{ links.length }}</span>
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
