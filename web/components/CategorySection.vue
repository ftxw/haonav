<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import LinkCard from './LinkCard.vue';
import { categoryIconUri } from '../lib/brandIcon';
import { SECTION_LABEL } from '../lib/ui';
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
    <!-- 玻璃语言：分类图标 + 大标题 + 微标签计数 + 细分隔线（不再吸顶）；icon 型用与「全部链接」同风格的线性图标 -->
    <div class="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3 dark:border-white/10">
      <AppIcon
        v-if="section.cat.icon.type === 'icon'"
        :name="section.cat.icon.value"
        :size="22"
        class="text-slate-400 dark:text-slate-500"
      />
      <img v-else :src="iconSrc" width="22" height="22" alt="" class="h-[22px] w-[22px] rounded-md" />
      <h2 class="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">{{ section.cat.name }}</h2>
      <span :class="SECTION_LABEL">{{ section.links.length }}</span>
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
