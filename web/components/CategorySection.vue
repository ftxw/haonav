<script setup lang="ts">
import CardHead from './CardHead.vue';
import LinkCard from './LinkCard.vue';
import { CARD_PAD, SHELL_CARD } from '../lib/ui';
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
  <!-- 每个分类一张内容卡：标题行（分类图标 + 标题 + 计数，带分割线）+ 卡片正文。
       `.cat-section` / `data-cat` 保留在最外层 —— 滚动联动高亮的 IntersectionObserver
       正是按这两个钩子取元素的，卡片外壳必须包在它们**里面**。 -->
  <section :id="'cat-' + section.cat.id" class="cat-section" :data-cat="section.cat.id" :class="SHELL_CARD">
    <CardHead :title="section.cat.name" :icon="section.cat.icon" :count="section.links.length" />

    <div :class="CARD_PAD">
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
    </div>
  </section>
</template>
