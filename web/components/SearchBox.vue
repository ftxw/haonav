<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { clearQuery, engine, flushQuery, runEngineSearch, setEngine, setMode, setQuery, state } from '../stores/nav';
import { SEG_ACTIVE } from '../lib/ui';

const inputRef = ref<HTMLInputElement | null>(null);

const engines = computed(() => state.settings.searchEngines ?? []);
const placeholder = computed(() =>
  state.mode === 'web' ? `用 ${engine.value?.name ?? '搜索引擎'} 搜索…` : '搜索站内链接…（/ 聚焦）',
);

function pillClass(active: boolean): string {
  return (
    'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs ' +
    (active ? SEG_ACTIVE : 'text-slate-500 dark:text-slate-400')
  );
}

function onSubmit(): void {
  if (state.mode === 'web') runEngineSearch(state.query);
  else flushQuery();
}

/** 键盘快捷键：/ 聚焦、Esc 清空（约 10 行） */
function onKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (e.key === '/' && !typing) {
    e.preventDefault();
    inputRef.value?.focus();
  } else if (e.key === 'Escape' && t === inputRef.value) {
    clearQuery();
    inputRef.value?.blur();
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="flex min-w-0 flex-1 items-center gap-2">
    <!-- 站内 / 站外 胶囊切换 -->
    <div class="flex shrink-0 rounded-full bg-slate-100 p-0.5 dark:bg-slate-700">
      <button type="button" :class="pillClass(state.mode === 'local')" @click="setMode('local')">站内</button>
      <button type="button" :class="pillClass(state.mode === 'web')" @click="setMode('web')">站外</button>
    </div>

    <form class="relative flex min-w-0 flex-1 items-center" @submit.prevent="onSubmit">
      <AppIcon name="search" :size="16" class="pointer-events-none absolute left-3 text-slate-400" />
      <input
        ref="inputRef"
        :value="state.query"
        :placeholder="placeholder"
        type="text"
        autocomplete="off"
        spellcheck="false"
        class="w-full rounded-full border border-transparent bg-slate-100 py-2 pl-9 pr-9 text-sm text-slate-800 outline-none transition-all placeholder-slate-400 hover:bg-white focus:bg-white focus:ring-2 focus:ring-blue-500/50 dark:bg-slate-700/50 dark:text-white dark:hover:bg-slate-700 dark:focus:bg-slate-700"
        @input="setQuery(($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="state.query"
        type="button"
        aria-label="清空搜索"
        class="absolute right-2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
        @click="clearQuery"
      >
        <AppIcon name="close" :size="14" />
      </button>
    </form>

    <!-- 站外模式的引擎下拉（引擎来自 settings.searchEngines） -->
    <div v-if="state.mode === 'web'" class="relative hidden shrink-0 sm:block">
      <select
        :value="state.engineId"
        aria-label="搜索引擎"
        class="appearance-none rounded-full border border-slate-200 bg-white py-2 pl-3 pr-7 text-sm text-slate-700 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        @change="setEngine(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="e in engines" :key="e.id" :value="e.id">{{ e.name }}</option>
      </select>
      <AppIcon
        name="chevron-down"
        :size="14"
        class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </div>
  </div>
</template>
