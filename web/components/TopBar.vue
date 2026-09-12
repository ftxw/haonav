<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import SearchBox from './SearchBox.vue';
import { GLASS } from '../lib/ui';
import { setCardStyle, setDrawer, setTheme, state } from '../stores/nav';

/** 两个分段控件共用一套按钮样式（浅色/深色、卡片/图标），风格统一 */
const VIEWS: { value: 'card' | 'icon'; icon: string; title: string }[] = [
  { value: 'card', icon: 'list', title: '卡片视图' },
  { value: 'icon', icon: 'grid', title: '图标视图' },
];

function toggleTheme(): void {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function segCls(active: boolean): string {
  return (
    'rounded p-1.5 transition-all ' +
    (active
      ? 'bg-white text-accent shadow-sm dark:bg-slate-600 dark:text-slate-100'
      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')
  );
}
</script>

<template>
  <header
    :class="[
      'relative z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4 shadow-sm backdrop-blur-xl lg:px-8',
      GLASS,
    ]"
  >
    <!-- 左：移动端目录开关 -->
    <button
      type="button"
      aria-label="打开目录"
      class="shrink-0 rounded-full p-2 text-slate-600 transition-colors hover:bg-white/60 lg:hidden dark:text-slate-300 dark:hover:bg-white/10"
      @click="setDrawer(true)"
    >
      <AppIcon name="menu" />
    </button>

    <!-- 中：搜索组（站内/站外胶囊 + 圆角搜索框，玻璃材质） -->
    <div class="flex min-w-0 max-w-2xl flex-1 items-center">
      <SearchBox />
    </div>

    <!-- 右：浅色/深色 与 卡片/图标 两个同款分段控件 -->
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <div class="flex items-center gap-1 rounded-lg bg-slate-200/60 p-1 dark:bg-white/10" role="group" aria-label="主题">
        <button
          type="button"
          title="浅色"
          aria-label="浅色"
          :class="segCls(state.theme === 'light')"
          @click="setTheme('light')"
        >
          <AppIcon name="sun" :size="16" />
        </button>
        <button
          type="button"
          title="深色"
          aria-label="深色"
          :class="segCls(state.theme === 'dark')"
          @click="setTheme('dark')"
        >
          <AppIcon name="moon" :size="16" />
        </button>
      </div>

      <div class="flex items-center gap-1 rounded-lg bg-slate-200/60 p-1 dark:bg-white/10" role="group" aria-label="卡片视图">
        <button
          v-for="v in VIEWS"
          :key="v.value"
          type="button"
          :title="v.title"
          :aria-label="v.title"
          :class="segCls(state.cardStyle === v.value)"
          @click="setCardStyle(v.value)"
        >
          <AppIcon :name="v.icon" :size="16" />
        </button>
      </div>
    </div>
  </header>
</template>
