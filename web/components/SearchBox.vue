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
  <!-- 外层容器：玻璃胶囊，聚焦整块抬升 + accent 光环（对齐参考站） -->
  <div
    class="glass-surface relative flex h-10 min-w-0 w-full max-w-md items-center rounded-full transition-all duration-300 focus-within:-translate-y-0.5 focus-within:shadow-lg focus-within:ring-2 focus-within:ring-accent/50"
  >
    <!-- 搜索范围 / 引擎选择（内置在搜索框左侧） -->
    <div data-engine-root class="relative h-full">
      <button
        type="button"
        class="flex h-full items-center gap-2 rounded-l-full pl-3 pr-2 text-sm text-slate-600 transition-colors hover:bg-white/40 hover:text-accent dark:text-slate-300 dark:hover:bg-white/10"
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
        class="animate-zoom-in glass-surface absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl py-1"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/40 dark:hover:bg-white/10"
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
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/40 dark:hover:bg-white/10"
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
    <div class="mx-1 h-4 w-px bg-slate-300/50 dark:bg-white/15"></div>

    <form class="flex h-full min-w-0 flex-1 items-center" @submit.prevent="onSubmit">
      <input
        ref="inputRef"
        :value="state.query"
        :placeholder="placeholder"
        type="text"
        autocomplete="off"
        spellcheck="false"
        class="h-full w-full flex-1 border-none bg-transparent px-2 text-sm text-slate-800 outline-none placeholder-slate-400 focus:ring-0 dark:text-slate-100"
        @input="setQuery(($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="state.query"
        type="button"
        aria-label="清空搜索"
        class="mr-1 hidden rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/40 hover:text-red-500 sm:block dark:hover:bg-white/10"
        @click="clearQuery"
      >
        <AppIcon name="close" :size="14" />
      </button>
      <button
        type="submit"
        aria-label="搜索"
        class="h-full rounded-r-full border-l border-transparent px-4 text-slate-500 transition-colors hover:bg-accent/10 hover:text-accent dark:text-slate-300"
      >
        <AppIcon name="search" :size="16" />
      </button>
    </form>
  </div>
</template>
