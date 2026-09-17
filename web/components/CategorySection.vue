<script setup lang="ts">
import CardHead from './CardHead.vue';
import LinkCard from './LinkCard.vue';
import type { CardStyle, IconStrategy } from '../lib/models';
import type { IndexedLink, Section } from '../stores/nav';

const props = defineProps<{
  section: Section;
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
  <!-- 每个分类一个区块，**没有整体大卡**：链接列表里每张链接卡自己就是卡片（CARD_FRAME），
       外层只留标题行 + 网格，避免「一张大卡套一堆小卡」的双重背景。
       `.cat-section` / `data-cat` 仍在此元素上 —— 滚动联动高亮的 IntersectionObserver
       正是按这两个钩子取元素的，别挪到内层去。 -->
  <section :id="'cat-' + section.cat.id" class="cat-section" :data-cat="section.cat.id">
    <CardHead :title="section.cat.name" :icon="section.cat.icon" :count="section.links.length" />

    <div v-if="section.links.length" class="grid gap-3" :class="gridClass">
      <LinkCard
        v-for="l in section.links"
        :key="l.id"
        :link="l"
        :card-style="cardStyle"
        :icon-strategy="iconStrategy"
        :open-in-new-tab="openInNewTab"
        :icon-api="iconApi"
        @context="emit('context', $event)"
      />
    </div>
    <p v-else class="py-8 text-center text-sm italic text-slate-400">暂无链接</p>
  </section>
</template>
