<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { firstChar } from '../lib/brandIcon';
import type { Category, FooterLink, SiteSettings } from '../lib/models';
import { ALL } from '../stores/nav';

const props = defineProps<{
  settings: SiteSettings;
  categories: Category[];
  counts: Record<string, number>;
  totalCount: number;
  activeCat: string;
}>();

const emit = defineEmits<{ select: [id: string]; close: [] }>();

/** 品牌：image 用图片；letter/emoji 用 legacy 渐变色块（from-blue-500 to-purple-600） */
const brandImage = computed(() =>
  props.settings.icon.type === 'image' && props.settings.icon.value ? props.settings.icon.value : '',
);
const brandChar = computed(() =>
  props.settings.icon.type === 'emoji' && props.settings.icon.value ? props.settings.icon.value : firstChar(props.settings.name),
);

const footers = computed<FooterLink[]>(() => props.settings.footerLinks ?? []);
const catIcons = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  for (const c of props.categories) m[c.id] = categoryIconUri(c.icon, c.name, c.id);
  return m;
});

/** 对齐 legacy：分类选中 bg-blue-100，「全部链接」选中更淡的 bg-blue-50、行更高 */
function itemClass(active: boolean, opts?: { pale?: boolean; tall?: boolean }): string {
  const activeCls = opts?.pale
    ? 'bg-blue-50 font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-blue-100 font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-400';
  return (
    'flex w-full items-center gap-3 rounded-xl px-4 transition-all ' +
    (opts?.tall ? 'py-3 ' : 'py-2.5 ') +
    (active ? activeCls : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700')
  );
}
</script>

<template>
  <aside class="sidebar flex h-full w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
    <!-- 品牌区：渐变 logo + 渐变站名（legacy） -->
    <div class="flex h-16 shrink-0 items-center gap-3 border-b border-slate-100 px-6 dark:border-slate-700">
      <img
        v-if="brandImage"
        :src="brandImage"
        width="32"
        height="32"
        alt=""
        class="h-8 w-8 shrink-0 rounded-lg"
      />
      <div
        v-else
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-base font-bold text-white shadow-lg shadow-blue-500/30"
      >
        {{ brandChar }}
      </div>
      <span
        class="min-w-0 truncate bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-lg font-bold text-transparent dark:from-blue-400 dark:to-purple-400"
        >{{ settings.name }}</span
      >
      <button
        type="button"
        class="ml-auto rounded-full p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-700"
        aria-label="关闭目录"
        @click="emit('close')"
      >
        <AppIcon name="close" />
      </button>
    </div>

    <!-- 目录 -->
    <nav class="hn-scroll no-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
      <button
        type="button"
        :class="itemClass(activeCat === ALL, { pale: true, tall: true })"
        @click="emit('select', ALL)"
      >
        <AppIcon name="grid" :size="16" />
        <span class="flex-1 truncate text-left text-sm">全部链接</span>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{{
          totalCount
        }}</span>
      </button>

      <p class="px-4 pb-1 pt-3 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">分类目录</p>

      <button
        v-for="c in categories"
        :key="c.id"
        type="button"
        :class="itemClass(activeCat === c.id)"
        @click="emit('select', c.id)"
      >
        <span
          :class="[
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            activeCat === c.id ? 'bg-blue-100 dark:bg-blue-800' : 'bg-slate-100 dark:bg-slate-800',
          ]"
        >
          <img :src="catIcons[c.id]" width="16" height="16" alt="" class="h-4 w-4 rounded" />
        </span>
        <span class="flex-1 truncate text-left text-sm">{{ c.name }}</span>
        <span v-if="activeCat === c.id" class="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
        <span v-else class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{{
          counts[c.id] ?? 0
        }}</span>
      </button>
    </nav>

    <!-- 页脚外链（来自 settings.footerLinks，零硬编码） -->
    <div v-if="footers.length" class="shrink-0 border-t border-slate-100 p-3 dark:border-slate-700">
      <a
        v-for="f in footers"
        :key="f.url"
        :href="f.url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-700/60"
      >
        <AppIcon name="external" :size="13" />
        <span class="truncate">{{ f.label }}</span>
      </a>
    </div>
  </aside>
</template>
