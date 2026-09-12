<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { clearQuery, engine, flushQuery, runEngineSearch, setEngine, setMode, setQuery, state } from '../stores/nav';

const inputRef = ref<HTMLInputElement | null>(null);
const openEngine = ref(false);

const engines = computed(() => state.settings.searchEngines ?? []);
const placeholder = computed(() =>
  state.mode === 'web' ? `用 ${engine.value?.name ?? '搜索引擎'} 搜索…` : '搜索站内链接…（/ 聚焦）',
);

/** 下拉把「站内搜索」与各个搜索引擎放在同一处：选站内 = local，选引擎 = web + 该引擎 */
function pickEngine(id: string): void {
  openEngine.value = false;
  if (id === '__local__') {
    setMode('local');
    inputRef.value?.focus();
    return;
  }
  setMode('web');
  setEngine(id);
  inputRef.value?.focus();
}

function engineIcon(e: { icon?: string }): string {
  return e.icon && e.icon.startsWith('http') ? e.icon : '';
}

function onSubmit(): void {
  if (state.mode === 'web') runEngineSearch(state.query);
  else flushQuery();
}

function onDocMouseDown(e: MouseEvent): void {
  if (openEngine.value && !(e.target as HTMLElement).closest('[data-engine-root]')) openEngine.value = false;
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

onMounted(() => {
  window.addEventListener('keydown', onKey);
  document.addEventListener('mousedown', onDocMouseDown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('mousedown', onDocMouseDown);
});
</script>

<template>
  <!-- 外层容器：类名照抄参考站搜索栏，主色走 --accent；按需求去掉所有 hover: 触发的动效 -->
  <div
    class="relative flex items-center w-full h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-sm transition-all duration-300 focus-within:ring-2 focus-within:ring-accent/50 focus-within:shadow-lg focus-within:-translate-y-0.5"
  >
    <!-- 搜索范围 / 引擎选择（内置在搜索框左侧） -->
    <div data-engine-root class="relative h-full">
      <button
        type="button"
        class="h-full pl-3 pr-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 rounded-l-xl outline-none w-auto md:min-w-[5.5rem]"
        :title="state.mode === 'web' ? '选择搜索引擎' : '搜索范围：站内'"
        :aria-expanded="openEngine"
        @click="openEngine = !openEngine"
      >
        <img
          v-if="state.mode === 'web' && engine && engineIcon(engine)"
          :src="engineIcon(engine)"
          width="16"
          height="16"
          alt=""
          class="h-4 w-4 shrink-0 rounded-full object-cover"
        />
        <AppIcon v-else name="search" :size="15" />
        <span class="hidden md:block">{{ state.mode === 'web' ? (engine?.name ?? '搜索引擎') : '站内' }}</span>
        <AppIcon name="chevron-down" :size="13" />
      </button>

      <div
        v-if="openEngine"
        class="animate-zoom-in absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/60"
          :class="state.mode === 'local' ? 'text-accent' : 'text-slate-600 dark:text-slate-300'"
          @click="pickEngine('__local__')"
        >
          <AppIcon name="search" :size="14" />
          <span class="flex-1">站内搜索</span>
          <AppIcon v-if="state.mode === 'local'" name="check" :size="14" />
        </button>
        <button
          v-for="e in engines"
          :key="e.id"
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/60"
          :class="state.mode === 'web' && state.engineId === e.id ? 'text-accent' : 'text-slate-600 dark:text-slate-300'"
          @click="pickEngine(e.id)"
        >
          <img
            v-if="engineIcon(e)"
            :src="engineIcon(e)"
            width="16"
            height="16"
            alt=""
            class="h-4 w-4 shrink-0 rounded-full object-cover"
          />
          <AppIcon v-else name="search" :size="14" />
          <span class="flex-1 truncate">{{ e.name }}</span>
          <AppIcon v-if="state.mode === 'web' && state.engineId === e.id" name="check" :size="14" />
        </button>
      </div>
    </div>

    <!-- 竖分隔线 -->
    <div class="h-4 w-px bg-slate-200 dark:bg-slate-600 mx-1"></div>

    <form class="flex h-full min-w-0 flex-1 items-center" @submit.prevent="onSubmit">
      <input
        ref="inputRef"
        :value="state.query"
        :placeholder="placeholder"
        type="text"
        autocomplete="off"
        spellcheck="false"
        class="flex-1 bg-transparent border-none text-slate-700 dark:text-slate-200 text-sm focus:ring-0 placeholder-slate-400 h-full w-full outline-none px-2"
        @input="setQuery(($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="state.query"
        type="button"
        aria-label="清空搜索"
        class="hidden p-1.5 mr-1 rounded-full text-slate-400 hover:text-red-500 sm:block"
        @click="clearQuery"
      >
        <AppIcon name="close" :size="14" />
      </button>
      <button
        type="submit"
        aria-label="搜索"
        class="h-full px-4 rounded-r-xl text-slate-500 dark:text-slate-300 border-l border-transparent dark:border-slate-700/50"
      >
        <AppIcon name="search" :size="16" />
      </button>
    </form>
  </div>
</template>
