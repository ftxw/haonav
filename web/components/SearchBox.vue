<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { clearQuery, engine, flushQuery, runEngineSearch, setEngine, setMode, setQuery, state } from '../stores/nav';

const inputRef = ref<HTMLInputElement | null>(null);
const openEngine = ref(false);

const engines = computed(() => state.settings.searchEngines ?? []);
const isLocal = computed(() => state.mode === 'local');

const placeholder = computed(() =>
  state.mode === 'web' ? `在 ${engine.value?.name ?? '搜索引擎'} 搜索...` : '搜索书签...',
);

/** 引擎下拉：仅列搜索引擎（站内/站外由左侧胶囊切换） */
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

/** 键盘快捷键：/ 聚焦、Esc 清空 */
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

/** 站内/站外 胶囊按钮：选中态与顶栏「布局切换」分段控件选中态完全一致
    （bg-white text-accent shadow-sm；深色 bg-slate-600 text-slate-100），
    不再区分站内/站外，保证两者选中色一致且都等于布局按钮 icon 选中色 */
function modeCls(active: boolean): string {
  return (
    'h-full rounded-full px-3 text-xs font-medium transition-all ' +
    (active
      ? 'bg-white text-accent shadow-sm dark:bg-slate-600 dark:text-slate-100'
      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')
  );
}
</script>

<template>
  <!-- 布局对齐原项目：站内/站外 胶囊在搜索框左侧；材质为当前玻璃风 -->
  <div class="flex w-full items-center gap-3" data-engine-root>
    <!-- 搜索模式胶囊 -->
    <div class="flex h-9 shrink-0 items-center rounded-full bg-slate-200/60 p-1 dark:bg-white/10">
      <button type="button" :class="modeCls(isLocal)" @click="setMode('local')">站内</button>
      <button type="button" :class="modeCls(state.mode === 'web')" @click="setMode('web')">站外</button>
    </div>

    <!-- 搜索框（原项目：rounded-full、图标在左、提交在右；无 hover 动效） -->
    <form class="relative flex min-w-0 flex-1 items-center" @submit.prevent="onSubmit">
      <input
        ref="inputRef"
        :value="state.query"
        :placeholder="placeholder"
        type="text"
        autocomplete="off"
        spellcheck="false"
        class="w-full h-9 rounded-full border border-slate-200/60 bg-white/60 pl-10 pr-12 text-sm text-slate-700 outline-none backdrop-blur placeholder-slate-400 transition-colors dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:placeholder-slate-500 focus:border-accent/50 focus:bg-white focus:ring-2 focus:ring-accent/50 dark:focus:bg-white/10"
        @input="setQuery(($event.target as HTMLInputElement).value)"
      />

      <!-- 左侧：站内 = 放大镜（纯指示）；站外 = 引擎按钮（展开下拉） -->
      <div class="absolute left-3 flex items-center text-slate-400 dark:text-slate-500">
        <AppIcon v-if="isLocal" name="search" :size="16" />
        <button
          v-else
          type="button"
          class="flex items-center text-slate-400 transition-colors hover:text-accent dark:text-slate-500 dark:hover:text-slate-300"
          :aria-expanded="openEngine"
          title="选择搜索引擎"
          @click.stop="openEngine = !openEngine"
        >
          <img
            v-if="engine && engineIcon(engine)"
            :src="engineIcon(engine)"
            width="16"
            height="16"
            alt=""
            class="h-4 w-4 rounded-full object-cover"
          />
          <AppIcon v-else name="search" :size="16" />
        </button>
      </div>

      <!-- 右侧提交（原项目：rounded-full 实底圆钮） -->
      <button
        type="submit"
        aria-label="搜索"
        class="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent transition-colors hover:bg-accent/25"
      >
        <AppIcon name="search" :size="15" />
      </button>

      <!-- 引擎下拉（原项目：left-0 top-full；玻璃材质） -->
      <div
        v-if="openEngine && state.mode === 'web'"
        class="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800"
      >
        <div class="py-2">
          <button
            v-for="e in engines"
            :key="e.id"
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-white/50 dark:hover:bg-white/10"
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
          </button>
        </div>
      </div>
    </form>
  </div>
</template>
