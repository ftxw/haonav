<script setup lang="ts">
import { computed, ref } from 'vue';
import AdminIcon from '../components/AdminIcon.vue';
import { mutate, commitCurrent, state, toast } from '../lib/adminStore';
import {
  BTN_PRIMARY_LG,
  BTN_SECONDARY,
  CARD_BOX,
  CARD_DESC,
  CARD_TITLE,
  INPUT,
  LINK_DANGER,
  PAGE,
  PAGE_HEAD,
  PAGE_HEAD_MAIN,
  PAGE_TITLE,
  SECTION_LABEL,
} from '../lib/adminUi';
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
    await commitCurrent();
  } finally {
    saving.value = false;
  }
}

/* 类名统一走 admin/lib/adminUi.ts（玻璃面 + accent 令牌，与前台同语言） */
const inputCls = INPUT;
const cardCls = CARD_BOX;
const titleCls = CARD_TITLE;
const descCls = CARD_DESC;
const miniBtn = BTN_SECONDARY;
</script>

<template>
  <div :class="PAGE">
    <!-- 页面标题区：微标签 + 大标题 + 右侧主操作 -->
    <div :class="PAGE_HEAD">
      <div :class="PAGE_HEAD_MAIN">
        <span :class="SECTION_LABEL">搜索配置</span>
        <h2 :class="PAGE_TITLE">搜索</h2>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <span class="text-xs text-slate-500">{{ state.dirty ? '有未保存的更改' : '所有更改已保存' }}</span>
        <button
          type="button"
          :class="BTN_PRIMARY_LG"
          :disabled="!state.dirty || state.saving || saving"
          @click="saveNow"
        >
          {{ state.saving || saving ? '保存中…' : '保存搜索引擎' }}
        </button>
      </div>
    </div>

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
            <button type="button" class="px-2 py-1.5" :class="LINK_DANGER" @click="removeEngine(e.id)">
              删除
            </button>
          </div>
        </div>
        <p v-if="!engines.length" class="text-xs text-slate-400">未配置（站外搜索将不可用）</p>
      </div>
    </div>

    <!-- 保存操作统一放在页面标题区（见上） -->
  </div>
</template>
