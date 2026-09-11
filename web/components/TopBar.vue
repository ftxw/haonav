<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from 'vue';
import AppIcon from './AppIcon.vue';
import SearchBox from './SearchBox.vue';
import type { CardStyle, ThemeMode } from '../lib/models';
import { GLASS, SEG_ACTIVE } from '../lib/ui';
import { setCardStyle, setDrawer, setTheme, state } from '../stores/nav';

const THEMES: { value: ThemeMode; icon: string; label: string }[] = [
  { value: 'light', icon: 'sun', label: '白天' },
  { value: 'dark', icon: 'moon', label: '黑夜' },
  { value: 'system', icon: 'monitor', label: '跟随系统' },
];
const STYLES: { value: CardStyle; icon: string; label: string }[] = [
  { value: 'card', icon: 'grid', label: '正常' },
  { value: 'compact', icon: 'list', label: '简洁' },
  { value: 'icon', icon: 'dots', label: '纯图标' },
];

/* ── 设置弹层（对齐参考站：一个设置入口，内含主题/视图切换） ── */
const open = ref(false);

function toggleSettings(): void {
  open.value = !open.value;
}

/** 点外面关闭（mousedown 以免和内部 click 抢事件） */
function onDocMouseDown(e: MouseEvent): void {
  if (open.value && !(e.target as HTMLElement).closest('[data-settings-root]')) open.value = false;
}
function onPanelClick(e: MouseEvent): void {
  // 点了面板内的选项就收起（点击目标是按钮时）
  if ((e.target as HTMLElement).closest('button')) open.value = false;
}

onMounted(() => document.addEventListener('mousedown', onDocMouseDown));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown));

function segClass(active: boolean): string {
  return 'flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors ' + (active ? SEG_ACTIVE : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200');
}
</script>

<template>
  <header
    :class="['relative z-30 flex h-16 shrink-0 items-center gap-2 border-b px-4 shadow-sm backdrop-blur-xl lg:px-8', GLASS]"
  >
    <button
      type="button"
      aria-label="打开目录"
      class="shrink-0 rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-200/60 lg:hidden dark:text-slate-300 dark:hover:bg-slate-700/60"
      @click="setDrawer(true)"
    >
      <AppIcon name="menu" />
    </button>

    <SearchBox />

    <!-- 设置入口：单个齿轮按钮 → 弹层内切换主题与视图 -->
    <div data-settings-root class="relative shrink-0">
      <button
        type="button"
        aria-label="显示设置"
        :title="'显示设置'"
        class="rounded-full p-2 transition-colors text-slate-600 hover:bg-slate-200/60 hover:text-emerald-600 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-emerald-400"
        :aria-expanded="open"
        @click="toggleSettings"
      >
        <AppIcon :name="open ? 'close' : 'gear'" :size="19" />
      </button>

      <div
        v-if="open"
        class="animate-slide-down absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-slate-200/60 bg-white/90 p-3 shadow-xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-800/90"
        @click="onPanelClick"
      >
        <p class="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">主题</p>
        <div class="mb-3 flex gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-700/60" role="group" aria-label="主题">
          <button
            v-for="t in THEMES"
            :key="t.value"
            type="button"
            :class="segClass(state.theme === t.value)"
            :title="t.label"
            :aria-label="t.label"
            @click="setTheme(t.value)"
          >
            <AppIcon :name="t.icon" :size="14" />
            <span>{{ t.label }}</span>
          </button>
        </div>

        <p class="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">视图</p>
        <div class="flex gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-700/60" role="group" aria-label="卡片视图">
          <button
            v-for="s in STYLES"
            :key="s.value"
            type="button"
            :class="segClass(state.cardStyle === s.value)"
            :title="s.label"
            :aria-label="s.label"
            @click="setCardStyle(s.value)"
          >
            <AppIcon :name="s.icon" :size="14" />
            <span>{{ s.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
