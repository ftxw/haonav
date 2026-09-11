<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import SearchBox from './SearchBox.vue';
import type { CardStyle, ThemeMode } from '../lib/models';
import { SEG_ACTIVE } from '../lib/ui';
import { setCardStyle, setDrawer, setTheme, state } from '../stores/nav';

const THEMES: { value: ThemeMode; icon: string; label: string }[] = [
  { value: 'light', icon: 'sun', label: '浅色' },
  { value: 'dark', icon: 'moon', label: '深色' },
  { value: 'system', icon: 'monitor', label: '跟随系统' },
];
const STYLES: { value: CardStyle; icon: string; label: string }[] = [
  { value: 'card', icon: 'grid', label: '卡片' },
  { value: 'compact', icon: 'list', label: '简洁' },
  { value: 'icon', icon: 'dots', label: '纯图标' },
];

const THEME_ORDER: ThemeMode[] = ['light', 'dark', 'system'];
const STYLE_ORDER: CardStyle[] = ['card', 'compact', 'icon'];

const themeIcon = computed(() => THEMES.find((t) => t.value === state.theme)?.icon ?? 'monitor');
const themeLabel = computed(() => THEMES.find((t) => t.value === state.theme)?.label ?? '跟随系统');
const styleIcon = computed(() => STYLES.find((s) => s.value === state.cardStyle)?.icon ?? 'grid');
const styleLabel = computed(() => STYLES.find((s) => s.value === state.cardStyle)?.label ?? '卡片');

function cycleTheme(): void {
  const i = THEME_ORDER.indexOf(state.theme);
  setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
}
function cycleStyle(): void {
  const i = STYLE_ORDER.indexOf(state.cardStyle);
  setCardStyle(STYLE_ORDER[(i + 1) % STYLE_ORDER.length]);
}

function segClass(active: boolean): string {
  return (
    'rounded-md px-2 py-1.5 transition-colors ' +
    (active ? SEG_ACTIVE : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200')
  );
}
</script>

<template>
  <header
    class="relative z-30 flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md lg:px-8 dark:border-slate-700 dark:bg-slate-800/80"
  >
    <button
      type="button"
      aria-label="打开目录"
      class="shrink-0 rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-700"
      @click="setDrawer(true)"
    >
      <AppIcon name="menu" />
    </button>

    <SearchBox />

    <!-- 主题切换：light / dark / system 三态（移动端折叠为循环按钮） -->
    <button
      type="button"
      :aria-label="'主题：' + themeLabel"
      :title="'主题：' + themeLabel"
      class="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 sm:hidden dark:text-slate-400 dark:hover:bg-slate-700"
      @click="cycleTheme"
    >
      <AppIcon :name="themeIcon" :size="18" />
    </button>
    <div
      class="hidden shrink-0 rounded-lg bg-slate-100 p-0.5 sm:flex dark:bg-slate-700"
      role="group"
      aria-label="主题"
    >
      <button
        v-for="t in THEMES"
        :key="t.value"
        type="button"
        :class="segClass(state.theme === t.value)"
        :title="t.label"
        :aria-label="t.label"
        @click="setTheme(t.value)"
      >
        <AppIcon :name="t.icon" :size="16" />
      </button>
    </div>

    <!-- 卡片视图三档（移动端折叠为循环按钮） -->
    <button
      type="button"
      :aria-label="'卡片视图：' + styleLabel"
      :title="'卡片视图：' + styleLabel"
      class="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 sm:hidden dark:text-slate-400 dark:hover:bg-slate-700"
      @click="cycleStyle"
    >
      <AppIcon :name="styleIcon" :size="18" />
    </button>
    <div class="hidden shrink-0 rounded-lg bg-slate-100 p-0.5 sm:flex dark:bg-slate-700" role="group" aria-label="卡片视图">
      <button
        v-for="s in STYLES"
        :key="s.value"
        type="button"
        :class="segClass(state.cardStyle === s.value)"
        :title="s.label"
        :aria-label="s.label"
        @click="setCardStyle(s.value)"
      >
        <AppIcon :name="s.icon" :size="16" />
      </button>
    </div>
  </header>
</template>
