<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import SearchBox from './SearchBox.vue';
import { GLASS } from '../lib/ui';
import { setCardStyle, setDrawer, setTheme, state } from '../stores/nav';

/* ── 两个独立按钮：白天/黑夜、卡片/图标（右对齐） ── */
function toggleTheme(): void {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}
function toggleCardStyle(): void {
  setCardStyle(state.cardStyle === 'icon' ? 'card' : 'icon');
}
</script>

<template>
  <header
    :class="[
      'relative z-30 flex h-16 shrink-0 items-center justify-center px-4 lg:px-8',
      GLASS,
    ]"
  >
    <!-- 左：移动端目录开关（绝对定位，不参与居中计算） -->
    <button
      type="button"
      aria-label="打开目录"
      class="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-slate-600 transition-colors hover:bg-white/50 lg:hidden dark:text-slate-300 dark:hover:bg-white/10"
      @click="setDrawer(true)"
    >
      <AppIcon name="menu" />
    </button>

    <!-- 中：搜索框居中（移动端左右留出按钮位置） -->
    <div class="w-full max-w-md px-10 lg:px-0">
      <SearchBox />
    </div>

    <!-- 右：两个独立切换按钮，右对齐 -->
    <div class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 lg:right-6">
      <button
        type="button"
        :title="state.theme === 'dark' ? '切换为白天' : '切换为黑夜'"
        :aria-label="state.theme === 'dark' ? '切换为白天' : '切换为黑夜'"
        class="rounded-full p-2 text-slate-600 transition-colors hover:bg-white/50 hover:text-accent dark:text-slate-300 dark:hover:bg-white/10"
        @click="toggleTheme"
      >
        <AppIcon :name="state.theme === 'dark' ? 'sun' : 'moon'" :size="19" />
      </button>

      <button
        type="button"
        :title="state.cardStyle === 'icon' ? '切换为卡片视图' : '切换为图标视图'"
        :aria-label="state.cardStyle === 'icon' ? '切换为卡片视图' : '切换为图标视图'"
        class="rounded-full p-2 text-slate-600 transition-colors hover:bg-white/50 hover:text-accent dark:text-slate-300 dark:hover:bg-white/10"
        @click="toggleCardStyle"
      >
        <AppIcon :name="state.cardStyle === 'icon' ? 'grid' : 'dots'" :size="19" />
      </button>
    </div>
  </header>
</template>
