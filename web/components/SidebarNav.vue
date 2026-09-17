<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { firstChar } from '../lib/brandIcon';
import type { Category, FooterLink, SiteSettings } from '../lib/models';
import { CHIP, PILL_ACTIVE, PILL_IDLE, SECTION_LABEL, SHELL_CARD } from '../lib/ui';
import { ALL } from '../stores/nav';

const props = defineProps<{
  settings: SiteSettings;
  categories: Category[];
  counts: Record<string, number>;
  totalCount: number;
  activeCat: string;
}>();

const emit = defineEmits<{ select: [id: string]; close: [] }>();

/** 品牌：image 用图片；letter/emoji 用参考站渐变色块（emerald→teal，规格⑤） */
const brandImage = computed(() =>
  props.settings.icon.type === 'image' && props.settings.icon.value ? props.settings.icon.value : '',
);
const brandChar = computed(() =>
  props.settings.icon.type === 'emoji' && props.settings.icon.value ? props.settings.icon.value : firstChar(props.settings.name),
);

const footers = computed<FooterLink[]>(() => props.settings.footerLinks ?? []);

/** 列表项图标的悬停缩放（选中态为实心主色底，不参与 hover 效果） */
function iconHoverCls(active: boolean): string {
  return active ? '' : 'group-hover:scale-110 transition-transform duration-300';
}

/** 选中态实心主色（对齐参考站分类 chip）；空闲态 hover 对齐参考站 logo 卡片 */
function itemClass(active: boolean, opts?: { tall?: boolean }): string {
  return (
    'flex w-full items-center gap-3 px-3 ' +
    (opts?.tall ? 'py-3.5 ' : 'py-3 ') +
    (active ? PILL_ACTIVE : PILL_IDLE)
  );
}
</script>

<template>
  <!-- 左列只有一张卡：品牌区（卡片标题行规格）+ 目录 + 页脚外链 -->
  <aside :class="SHELL_CARD + ' sidebar flex h-full w-64 flex-col overflow-hidden'">
    <!-- 品牌区：emerald→teal 渐变 logo（hover 缩放微旋转）+ 站名（与参考项目标题同色） -->
    <div
      class="group flex min-h-14 shrink-0 items-center gap-3 border-b border-slate-200/70 px-4 dark:border-white/10"
    >
      <img
        v-if="brandImage"
        :src="brandImage"
        width="32"
        height="32"
        alt=""
        class="h-8 w-8 shrink-0 rounded-lg ring-1 ring-white/30 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110 dark:ring-white/15"
      />
      <div
        v-else
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-600 text-base font-bold text-white shadow-lg shadow-emerald-500/40 ring-1 ring-white/25 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110"
      >
        {{ brandChar }}
      </div>
      <span class="min-w-0 truncate text-lg font-bold tracking-wide text-slate-700 dark:text-slate-100">{{ settings.name }}</span>
      <button
        type="button"
        class="ml-auto rounded-full p-2 text-slate-500 transition-colors hover:bg-white/50 lg:hidden dark:text-slate-400 dark:hover:bg-white/10"
        aria-label="关闭目录"
        @click="emit('close')"
      >
        <AppIcon name="close" />
      </button>
    </div>

    <!-- 目录（卡内边距 16px，与其它卡片一致；列表项内缩 12px，与后台导航项同规格） -->
    <nav class="hn-scroll no-scrollbar flex-1 space-y-1 overflow-y-auto p-4">
      <button
        type="button"
        :class="itemClass(activeCat === ALL, { tall: true })"
        @click="emit('select', ALL)"
      >
        <AppIcon name="grid" :size="20" :class="iconHoverCls(activeCat === ALL)" />
        <span class="flex-1 truncate text-left text-base">全部链接</span>
        <span :class="CHIP">{{ totalCount }}</span>
      </button>

      <p class="px-3 pb-1 pt-3" :class="SECTION_LABEL">分类目录</p>

      <button
        v-for="c in categories"
        :key="c.id"
        type="button"
        :class="itemClass(activeCat === c.id)"
        @click="emit('select', c.id)"
      >
        <!-- 分类图标与「全部链接」同一套线性图标（AppIcon），大小基线一致 -->
        <span :class="['flex h-5 w-5 shrink-0 items-center justify-center', iconHoverCls(activeCat === c.id)]">
          <AppIcon :name="c.icon" :size="20" />
        </span>
        <span class="flex-1 truncate text-left text-base">{{ c.name }}</span>
        <span v-if="activeCat === c.id" class="flex w-6 items-center justify-center">
          <span class="h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"></span>
        </span>
        <span v-else :class="CHIP">{{ counts[c.id] ?? 0 }}</span>
      </button>
    </nav>

    <!-- 页脚外链（来自 settings.footerLinks，零硬编码） -->
    <div v-if="footers.length" class="shrink-0 border-t border-slate-200/70 p-4 dark:border-white/10">
      <a
        v-for="f in footers"
        :key="f.url"
        :href="f.url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-white/50 hover:text-accent dark:text-slate-400 dark:hover:bg-white/10"
      >
        <AppIcon name="external" :size="13" />
        <span class="truncate">{{ f.label }}</span>
      </a>
    </div>
  </aside>
</template>
