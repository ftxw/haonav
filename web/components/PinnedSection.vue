<script setup lang="ts">
import CardHead from './CardHead.vue';
import LinkCard from './LinkCard.vue';
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
  <!-- 置顶区同样**没有整体大卡**：每张链接卡自己是卡片，外层只留标题行 + 网格。
       与分类区块保持同一套规则（见 CategorySection）。 -->
  <section>
    <CardHead title="置顶链接" icon="pin" :count="links.length" />
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
