<script setup lang="ts">
import { computed } from 'vue';
import AdminIcon from '../components/AdminIcon.vue';
import { mutate, save, state, toast } from '../lib/adminStore';
import type { SiteSettings } from '../../shared/types';

const settings = computed<SiteSettings | null>(() => state.doc?.settings ?? null);
const engines = computed(() => settings.value?.searchEngines ?? []);

/** 直接改 state.doc.settings，保存时 diff 自动生成 settings.update */
function patch(fn: (s: SiteSettings) => void): void {
  mutate((d) => {
    if (d.settings) fn(d.settings);
  });
}

function addEngine(): void {
  patch((s) => {
    s.searchEngines = [
      ...s.searchEngines,
      { id: 'eng-' + Date.now().toString(36), name: '新引擎', url: 'https://example.com/search?q=' },
    ];
  });
}
function removeEngine(id: string): void {
  patch((s) => {
    s.searchEngines = s.searchEngines.filter((e) => e.id !== id);
  });
}
function setEngineName(i: number, v: string): void {
  patch((s) => (s.searchEngines[i] = { ...s.searchEngines[i], name: v }));
}
function setEngineUrl(i: number, v: string): void {
  patch((s) => (s.searchEngines[i] = { ...s.searchEngines[i], url: v }));
}
/** 上移 / 下移（顺序即前台引擎下拉的顺序） */
function moveEngine(i: number, dir: -1 | 1): void {
  patch((s) => {
    const j = i + dir;
    if (j < 0 || j >= s.searchEngines.length) return;
    const arr = [...s.searchEngines];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    s.searchEngines = arr;
  });
}

const saving = ref(false);
async function saveNow(): Promise<void> {
  saving.value = true;
  try {
    await save();
  } finally {
    saving.value = false;
  }
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const cardCls = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';
const titleCls = 'text-sm font-bold text-slate-800 dark:text-slate-100';
const descCls = 'mt-0.5 text-xs text-slate-500 dark:text-slate-400';
const miniBtn =
  'rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200';
</script>

<template>
  <div class="space-y-4">
    <div :class="cardCls">
      <div class="flex items-center gap-2">
        <div>
          <h3 :class="titleCls">搜索引擎</h3>
          <p :class="descCls">前台「站外搜索」使用的引擎列表，顺序即下拉顺序；全部删除则站外搜索不可用。</p>
        </div>
        <button type="button" :class="miniBtn + ' ml-auto'" @click="addEngine">
          <span class="flex items-center gap-1"><AdminIcon name="plus" :size="13" /> 添加引擎</span>
        </button>
      </div>

      <div class="mt-3 space-y-2">
        <div v-for="(e, i) in engines" :key="e.id" class="flex flex-wrap items-center gap-2">
          <span class="w-6 shrink-0 text-center text-xs text-slate-400">{{ i + 1 }}</span>
          <input
            :value="e.name"
            type="text"
            placeholder="名称"
            :class="inputCls + ' w-32'"
            @input="setEngineName(i, ($event.target as HTMLInputElement).value)"
          />
          <input
            :value="e.url"
            type="text"
            placeholder="https://…/search?q="
            :class="inputCls + ' min-w-48 flex-1'"
            @input="setEngineUrl(i, ($event.target as HTMLInputElement).value)"
          />
          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              :class="miniBtn + ' px-2'"
              :disabled="i === 0"
              title="上移"
              @click="moveEngine(i, -1)"
            >
              <AdminIcon name="chevron-down" :size="14" class="rotate-180" />
            </button>
            <button
              type="button"
              :class="miniBtn + ' px-2'"
              :disabled="i === engines.length - 1"
              title="下移"
              @click="moveEngine(i, 1)"
            >
              <AdminIcon name="chevron-down" :size="14" />
            </button>
            <button type="button" class="px-2 py-1.5 text-xs text-red-500 hover:underline" @click="removeEngine(e.id)">
              删除
            </button>
          </div>
        </div>
        <p v-if="!engines.length" class="text-xs text-slate-400">未配置（站外搜索将不可用）</p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <button
        type="button"
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        :disabled="!state.dirty || state.saving || saving"
        @click="saveNow"
      >
        {{ state.saving || saving ? '保存中…' : '保存搜索引擎' }}
      </button>
      <span class="text-xs text-slate-500">{{ state.dirty ? '有未保存的更改' : '所有更改已保存' }}</span>
    </div>
  </div>
</template>
