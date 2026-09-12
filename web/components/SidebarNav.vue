<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import { categoryIconUri, firstChar } from '../lib/brandIcon';
import type { Category, FooterLink, SiteSettings } from '../lib/models';
import { CHIP, HERO_TITLE, PILL_ACTIVE, PILL_IDLE, SECTION_LABEL } from '../lib/ui';
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
const catIcons = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  for (const c of props.categories) m[c.id] = categoryIconUri(c.icon, c.name, c.id);
  return m;
});

/** 选中态主色走 --accent（后台改色实时生效）；「全部链接」底色更淡，避免抢走分类高亮 */
function itemClass(active: boolean, opts?: { pale?: boolean; tall?: boolean }): string {
  const activeCls = opts?.pale ? 'bg-accent/10 font-medium text-accent dark:bg-accent/15' : PILL_ACTIVE;
  return (
    'flex w-full items-center gap-3 rounded-xl px-4 transition-all ' +
    (opts?.tall ? 'py-3 ' : 'py-2.5 ') +
    (active ? activeCls : PILL_IDLE)
  );
}
</script>

<template>
  <aside class="sidebar glass-surface flex h-full w-64 flex-col">
    <!-- 品牌区：emerald→teal 渐变 logo（emerald glow + hover 缩放微旋转）+ 渐变站名 -->
    <div class="group flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/40 px-6 dark:border-white/10">
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
      <span :class="['min-w-0 truncate text-lg font-bold tracking-wide', HERO_TITLE]">{{ settings.name }}</span>
      <button
        type="button"
        class="ml-auto rounded-full p-2 text-slate-500 transition-colors hover:bg-white/50 lg:hidden dark:text-slate-400 dark:hover:bg-white/10"
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
        <span :class="CHIP">{{ totalCount }}</span>
      </button>

      <p class="px-4 pb-1 pt-3" :class="SECTION_LABEL">分类目录</p>

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
            activeCat === c.id ? 'bg-accent/25 dark:bg-accent/30' : 'bg-slate-900/[0.06] dark:bg-white/[0.08]',
          ]"
        >
          <img :src="catIcons[c.id]" width="16" height="16" alt="" class="h-4 w-4 rounded" />
        </span>
        <span class="flex-1 truncate text-left text-sm">{{ c.name }}</span>
        <span
          v-if="activeCat === c.id"
          class="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]"
        ></span>
        <span v-else :class="CHIP">{{ counts[c.id] ?? 0 }}</span>
      </button>
    </nav>

    <!-- 页脚外链（来自 settings.footerLinks，零硬编码） -->
    <div v-if="footers.length" class="shrink-0 border-t border-slate-200/40 p-3 dark:border-white/10">
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
