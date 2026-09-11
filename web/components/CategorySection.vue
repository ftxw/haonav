<script setup lang="ts">
import { computed } from 'vue';
import LinkCard from './LinkCard.vue';
import { categoryIconUri } from '../lib/brandIcon';
import type { CardStyle, IconStrategy } from '../lib/models';
import type { IndexedLink, Section } from '../stores/nav';

const props = defineProps<{
  section: Section;
  cardStyle: CardStyle;
  iconStrategy: IconStrategy;
  openInNewTab: boolean;
  gridClass: string;
}>();

const emit = defineEmits<{ context: [payload: { link: IndexedLink; x: number; y: number }] }>();

const iconSrc = computed(() => categoryIconUri(props.section.cat.icon, props.section.cat.name, props.section.cat.id));
</script>

<template>
  <section :id="'cat-' + section.cat.id" class="cat-section" :data-cat="section.cat.id">
    <!-- 对齐 legacy：icon + 加粗标题 + 下边框（不再吸顶） -->
    <div class="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
      <div class="flex items-center gap-2">
        <span class="text-slate-400">
          <img :src="iconSrc" width="20" height="20" alt="" class="h-5 w-5 rounded" />
        </span>
        <h2 class="text-lg font-bold text-slate-800 dark:text-slate-200">{{ section.cat.name }}</h2>
      </div>
      <span class="text-xs text-slate-400 dark:text-slate-500">{{ section.links.length }}</span>
    </div>

    <div v-if="section.links.length" class="grid gap-3" :class="gridClass">
      <LinkCard
        v-for="l in section.links"
        :key="l.id"
        :link="l"
        :card-style="cardStyle"
        :icon-strategy="iconStrategy"
        :open-in-new-tab="openInNewTab"
        @context="emit('context', $event)"
      />
    </div>
    <p v-else class="py-8 text-center text-sm italic text-slate-400">暂无链接</p>
  </section>
</template>
