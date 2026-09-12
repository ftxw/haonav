<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import SearchBox from './SearchBox.vue';
import { GLASS } from '../lib/ui';
import { setCardStyle, setDrawer, setTheme, state } from '../stores/nav';

/** 视图切换（布局对齐原项目：rounded-lg 分段控件，卡片/图标两档） */
const VIEWS: { value: 'card' | 'icon'; icon: string; title: string }[] = [
  { value: 'card', icon: 'list', title: '卡片视图' },
  { value: 'icon', icon: 'grid', title: '图标视图' },
];

function toggleTheme(): void {
  setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

/** 分段按钮：选中 = 白底 + 主色字 + shadow（对齐原项目）；未选中 = 灰字 */
function viewCls(active: boolean): string {
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
    <!-- 左：移动端目录开关（原项目无此元素；仅小屏出现，不参与桌面布局） -->
    <button
      type="button"
      aria-label="打开目录"
      class="shrink-0 rounded-full p-2 text-slate-600 transition-colors hover:bg-white/60 lg:hidden dark:text-slate-300 dark:hover:bg-white/10"
      @click="setDrawer(true)"
    >
      <AppIcon name="menu" />
    </button>

    <!-- 中：搜索组（约 1/4 宽、左对齐） -->
    <div class="flex w-full max-w-sm shrink-0 items-center">
      <SearchBox />
    </div>

    <!-- 右：白天/黑夜 按钮（前） + 卡片/图标 分段切换（后） -->
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <button
        type="button"
        :title="state.theme === 'dark' ? '切换为白天' : '切换为黑夜'"
        :aria-label="state.theme === 'dark' ? '切换为白天' : '切换为黑夜'"
        class="rounded-full p-2 text-slate-600 transition-colors hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
        @click="toggleTheme"
      >
        <AppIcon :name="state.theme === 'dark' ? 'sun' : 'moon'" :size="19" />
      </button>

      <div class="hidden items-center gap-1 rounded-lg bg-slate-200/60 p-1 md:flex dark:bg-white/10">
        <button
          v-for="v in VIEWS"
          :key="v.value"
          type="button"
          :title="v.title"
          :aria-label="v.title"
          :class="viewCls(state.cardStyle === v.value)"
          @click="setCardStyle(v.value)"
        >
          <AppIcon :name="v.icon" :size="16" />
        </button>
      </div>
    </div>
  </header>
</template>
