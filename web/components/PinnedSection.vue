<script setup lang="ts">
import CardHead from './CardHead.vue';
import LinkCard from './LinkCard.vue';
import { CARD_PAD, SHELL_CARD } from '../lib/ui';
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
  <!-- 置顶区也是一张内容卡：标题行（图标 + 标题 + 计数，带分割线）+ 卡片正文。
       与后台卡片同语言（rounded-2xl + glass-surface + 16px 内边距）。 -->
  <section :class="SHELL_CARD">
    <CardHead title="置顶链接" icon="pin" :count="links.length" />
    <div :class="CARD_PAD">
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
    </div>
  </section>
</template>
