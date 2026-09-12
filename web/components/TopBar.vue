<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import SearchBox from './SearchBox.vue';
import { GLASS } from '../lib/ui';
import { setCardStyle, setDrawer, setTheme, state } from '../stores/nav';

/** 视图切换（桌面分段控件 / 手机单图标互换） */
const VIEWS: { value: 'card' | 'icon'; icon: string; title: string }[] = [
  { value: 'card', icon: 'list', title: '卡片视图' },
  { value: 'icon', icon: 'grid', title: '图标视图' },
];

function toggleTheme(): void {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}
function toggleCardStyle(): void {
  setCardStyle(state.cardStyle === 'icon' ? 'card' : 'icon');
}

/* ── 手机：点击搜索图标 → 顶部下拉搜索面板 ── */
const searchOpen = ref(false);

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
}

/** 点外面关闭（搜索面板与切换按钮本身除外，避免关闭后又被 toggle 打开） */
function onDocMouseDown(e: MouseEvent): void {
  if (!searchOpen.value) return;
  const t = e.target as HTMLElement;
  if (!t.closest('[data-mobile-search-root]') && !t.closest('[data-mobile-search-toggle]')) searchOpen.value = false;
}

onMounted(() => document.addEventListener('mousedown', onDocMouseDown));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown));

/** 分段按钮（桌面）：选中 = 白底 + 主色字 + shadow */
function segCls(active: boolean): string {
  return (
    'rounded p-1.5 transition-all ' +
    (active
      ? 'bg-white text-accent shadow-sm dark:bg-slate-600 dark:text-slate-100'
      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200')
  );
}

/** 手机圆钮通用样式 */
const MOBILE_BTN =
  'rounded-full p-2 text-slate-600 transition-colors hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10';
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

    <!-- 桌面：内联搜索组（1/3 宽、左对齐） -->
    <div class="hidden min-w-0 max-w-md flex-1 md:flex">
      <SearchBox />
    </div>

    <!-- 右侧按钮组：手机 = 搜索/主题/布局 三个图标（右对齐）；桌面 = 两个分段控件 -->
    <div class="ml-auto flex shrink-0 items-center gap-1">
      <!-- 搜索（仅手机）：点击顶部下拉搜索面板 -->
      <button
        v-if="searchOpen"
        type="button"
        aria-label="关闭搜索"
        class="rounded-full p-2 text-slate-600 transition-colors hover:bg-white/60 md:hidden dark:text-slate-300 dark:hover:bg-white/10"
        @click="toggleSearch"
      >
        <AppIcon name="close" :size="19" />
      </button>
      <button
        v-else
        type="button"
        aria-label="搜索"
        data-mobile-search-toggle
        class="rounded-full p-2 text-slate-600 transition-colors hover:bg-white/60 md:hidden dark:text-slate-300 dark:hover:bg-white/10"
        :aria-expanded="searchOpen"
        @click="toggleSearch"
      >
        <AppIcon name="search" :size="19" />
      </button>

      <!-- 浅色/深色：单图标互换（明暗两态一个按钮） -->
      <button
        type="button"
        :title="state.theme === 'dark' ? '浅色模式' : '深色模式'"
        :aria-label="state.theme === 'dark' ? '浅色模式' : '深色模式'"
        :class="MOBILE_BTN"
        @click="toggleTheme"
      >
        <AppIcon :name="state.theme === 'dark' ? 'sun' : 'moon'" :size="19" />
      </button>

      <!-- 布局：手机 = 单图标互换；桌面 = 分段控件 -->
      <button
        type="button"
        :title="state.cardStyle === 'icon' ? '卡片视图' : '图标视图'"
        :aria-label="state.cardStyle === 'icon' ? '卡片视图' : '图标视图'"
        :class="[MOBILE_BTN, 'md:hidden']"
        @click="toggleCardStyle"
      >
        <AppIcon :name="state.cardStyle === 'icon' ? 'list' : 'grid'" :size="19" />
      </button>
      <div class="hidden items-center gap-1 rounded-lg bg-slate-200/60 p-1 md:flex dark:bg-white/10" role="group" aria-label="卡片视图">
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

    <!-- 手机搜索面板：从顶部下拉（前置站内/站外切换），仅小屏 -->
    <div
      v-if="searchOpen"
      data-mobile-search-root
      class="glass-surface absolute inset-x-0 top-full z-40 border-b px-4 py-3 md:hidden"
    >
      <SearchBox />
    </div>
  </header>
</template>
