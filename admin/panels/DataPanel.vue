<script setup lang="ts">
import { ref } from 'vue';
import Modal from '../components/Modal.vue';
import AdminIcon from '../components/AdminIcon.vue';
import PageHead from '../components/PageHead.vue';
import { api } from '../lib/adminApi';
import { parseBookmarksHtml, type ParsedItem } from '../lib/importParse';
import { slugId, hostOf, maxOrderOf } from '../lib/util';
import { commit, reload, state, toast } from '../lib/adminStore';
import CardHead from '../components/CardHead.vue';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  INPUT_BASE,
  PAGE,
  TAG_NEUTRAL,
  TAG_OK,
  TAG_WARN,
} from '../lib/adminUi';
import type { LinkItem } from '../../shared/types';

/* ═══════════════════════ ① 导入书签 ═══════════════════════ */

type ImportPhase = 'idle' | 'parsing' | 'diffing' | 'preview' | 'applying';
const phase = ref<ImportPhase>('idle');
const importError = ref('');
const progressText = ref('');
const noFolderCat = ref<string>('__none__');
const conflictChoice = ref<'new' | 'old' | 'skip'>('old');

const added = ref<ParsedItem[]>([]);
const existingCount = ref(0);
const conflicts = ref<{ item: ParsedItem; existing: LinkItem }[]>([]);
const addedByCat = ref<{ name: string; count: number }[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);

const catNameOf = (id: string): string =>
  id === '' ? '未分类' : (state.doc?.categories.find((c) => c.id === id)?.name ?? id);

const CHUNK = 200;

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  importError.value = '';
  added.value = [];
  conflicts.value = [];
  existingCount.value = 0;
  addedByCat.value = [];

  try {
    if (/\.json$/i.test(file.name)) {
      await restoreFromJson(file);
      return;
    }
    phase.value = 'parsing';
    progressText.value = '正在解析书签文件（Web Worker）…';
    const items = await parseBookmarksHtml(await file.text());
    if (!items.length) throw new Error('没有解析到任何书签（请确认是浏览器导出的 HTML 书签文件）');
    await diffItems(items);
  } catch (err) {
    phase.value = 'idle';
    importError.value = err instanceof Error ? err.message : '导入失败';
  }
}

/** 从 JSON 备份整体还原（categories / links / settings） */
async function restoreFromJson(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text()) as Partial<{ categories: unknown; links: unknown; settings: unknown }>;
  if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.links)) {
    throw new Error('JSON 结构不符：缺少 categories / links');
  }
  if (!window.confirm(`将用备份文件覆盖当前文档（${(parsed.links as unknown[]).length} 条链接）。确认继续？`)) {
    phase.value = 'idle';
    return;
  }
  await commit((d) => {
    d.categories = parsed.categories as typeof d.categories;
    d.links = parsed.links as typeof d.links;
    if (parsed.settings && typeof parsed.settings === 'object') d.settings = parsed.settings as typeof d.settings;
  });
  toast('已从 JSON 备份还原');
  phase.value = 'idle';
}

/** 分批（≤200）调用 /api/import/parse 聚合 diff，不落库 */
async function diffItems(items: ParsedItem[]): Promise<void> {
  phase.value = 'diffing';
  const catIds = new Map<string, string>(state.doc?.categories?.map((c) => [c.name, c.id]) ?? []);
  const withIds = items.map((it) => {
    const name = it.cat;
    let id = name ? catIds.get(name) : undefined;
    if (name && !id) {
      id = slugId('imp', name); // 预生成 id，确认导入时统一创建
      catIds.set(name, id);
    }
    return { ...it, cat: name ? id : undefined };
  });

  const addedAll: ParsedItem[] = [];
  const conflictAll: { item: ParsedItem; existing: LinkItem }[] = [];
  let existing = 0;

  for (let i = 0; i < withIds.length; i += CHUNK) {
    progressText.value = `正在比对 ${Math.min(i + CHUNK, withIds.length)} / ${withIds.length} …`;
    const res = await api.importParse(withIds.slice(i, i + CHUNK));
    addedAll.push(...(res.added as ParsedItem[]));
    // import/parse 回显的 item 就是本次提交的 ParsedItem（必填字段齐全），此处对齐类型
    conflictAll.push(...(res.conflict as { item: ParsedItem; existing: LinkItem }[]));
    existing += res.counts.existing;
  }

  added.value = addedAll;
  conflicts.value = conflictAll;
  existingCount.value = existing;

  const byCat = new Map<string, number>();
  for (const it of addedAll) {
    const key = (it.cat as string) ?? '';
    byCat.set(key, (byCat.get(key) ?? 0) + 1);
  }
  addedByCat.value = [...byCat.entries()]
    .map(([id, count]) => ({ name: id === '' ? '未分类' : catNameOf(id), count }))
    .sort((a, b) => b.count - a.count);

  phase.value = 'preview';
}

/** 确认导入：先补齐缺失分类，再分批 /api/import/apply（order 一律追加到末尾） */
async function confirmImport(): Promise<void> {
  if (!state.doc) return;
  phase.value = 'applying';
  importError.value = '';
  try {
    // ① 预生成 id 的分类真正落库
    const existingNames = new Set(state.doc.categories.map((c) => c.name));
    const needNames = new Set<string>();
    for (const it of added.value) if (it.cat && !existingNames.has(it.cat)) needNames.add(it.cat);
    const nameToId = new Map<string, string>(state.doc.categories.map((c) => [c.name, c.id]));
    if (needNames.size) {
      if (!(await commit((d) => {
        let last = maxOrderOf(d.categories.map((c) => c.order));
        for (const name of needNames) {
          const id = slugId('imp', name);
          last = last ? last + '1' : 'V';
          d.categories.push({ id, name, icon: 'folder', order: last });
          nameToId.set(name, id);
        }
      }))) throw new Error('创建分类失败，导入已取消');
    }

    // ② 冲突「保留新值」的条目也加入导入
    const items: ParsedItem[] = [...added.value];
    if (conflictChoice.value === 'new') items.push(...conflicts.value.map((c) => c.item));

    // ③ 分批追加
    let applied = 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      progressText.value = `正在写入 ${Math.min(i + CHUNK, items.length)} / ${items.length} …`;
      const batch = items.slice(i, i + CHUNK).map((it) => ({
        ...it,
        cat: it.cat ? nameToId.get(it.cat) ?? undefined : undefined,
      }));
      const targetCat = noFolderCat.value === '__none__' ? undefined : noFolderCat.value;
      const res = await api.importApply(state.doc.rev, batch, targetCat);
      state.doc = { ...state.doc, rev: res.rev };
      applied += res.added;
    }

    // ④ 与服务端重新对齐（import/apply 不返回文档）
    await reload();

    // ⑤ 冲突「保留新值」时，已存在链接的标题/描述按新值覆盖（diff 出 link.update）
    if (conflictChoice.value === 'new') {
      const byKey = new Map<string, LinkItem>();
      for (const it of conflicts.value) byKey.set(it.existing.urlKey, it.existing);
      await commit((d) => {
        for (const l of d.links) {
          const ex = byKey.get(l.urlKey);
          if (!ex) continue;
          const src = conflicts.value.find((c) => c.existing.id === l.id)?.item;
          if (!src) continue;
          l.title = src.title;
          if (src.desc) l.desc = src.desc;
        }
      });
    }

    toast(`导入完成：新增 ${applied} 条，已存在 ${existingCount.value} 条，冲突 ${conflicts.value.length} 条`);
    phase.value = 'idle';
    added.value = [];
    conflicts.value = [];
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '导入失败';
    phase.value = 'preview';
  }
}

function cancelImport(): void {
  phase.value = 'idle';
  added.value = [];
  conflicts.value = [];
}

/* ═════════ ② 快照 / 导出 → BackupPanel；③ 重复 / 死链检测 → CheckPanel ═════════ */

/* 类名统一走 admin/lib/adminUi.ts（内容面 + accent 令牌，与其它面板同语言） */
const cardCls = CARD + ' overflow-hidden';
</script>

<template>
  <div :class="PAGE">
    <!-- 页面标题卡：一级分类 / 二级分类 / 说明全部派生自 lib/panels.ts（与左侧导航同步） -->
    <PageHead panel="data" />

    <!-- ① 导入 -->
    <div :class="cardCls">
      <CardHead title="导入书签" />
      <div class="p-4">
        <div class="flex flex-wrap items-center gap-2">
          <input ref="fileInput" type="file" accept=".html,.htm,.json" class="hidden" @change="onFile" />
          <button type="button" :class="BTN_PRIMARY" :disabled="phase !== 'idle'" @click="fileInput?.click()">
            选择文件…
          </button>
          <label class="flex items-center gap-1.5 text-xs text-slate-500">
            无文件夹条目归入
            <select v-model="noFolderCat" :class="INPUT_BASE + ' w-40 shrink-0'">
              <option value="__none__">未分类</option>
              <option v-for="c in state.doc?.categories ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <span v-if="phase === 'parsing' || phase === 'diffing' || phase === 'applying'" class="text-xs text-accent">{{ progressText }}</span>
        </div>
        <p v-if="importError" class="mt-2 text-xs text-red-500">{{ importError }}</p>
      </div>
    </div>

    <!-- ② 导出 -->
    <div :class="cardCls">
      <CardHead title="导出" />
      <div class="flex flex-wrap gap-2 p-4">
        <a :href="api.exportUrl('json')" :class="BTN_SECONDARY">
          <span class="flex items-center gap-1.5"><AdminIcon name="download" :size="13" /> 导出 JSON</span>
        </a>
        <a :href="api.exportUrl('html')" :class="BTN_SECONDARY">
          <span class="flex items-center gap-1.5"><AdminIcon name="download" :size="13" /> 导出 HTML 书签</span>
        </a>
      </div>
    </div>

    <!-- 导入预览 -->
    <Modal v-if="phase === 'preview' || phase === 'applying'" title="导入预览" wide @close="phase !== 'applying' && cancelImport()">
      <div class="space-y-4 text-sm">
        <div class="flex flex-wrap gap-2">
          <span :class="TAG_OK">新增 {{ added.length }}</span>
          <span :class="TAG_NEUTRAL">已存在 {{ existingCount }}</span>
          <span :class="TAG_WARN">冲突 {{ conflicts.length }}</span>
        </div>

        <div v-if="addedByCat.length">
          <p class="mb-1 text-xs font-medium text-slate-500">新增条目按分类</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="g in addedByCat" :key="g.name" :class="TAG_NEUTRAL">
              {{ g.name }} · {{ g.count }}
            </span>
          </div>
        </div>

        <div v-if="conflicts.length">
          <p class="mb-1 text-xs font-medium text-slate-500">冲突处理（同网址已存在，但标题或分类不同）</p>
          <div class="mb-2 flex gap-3 text-xs">
            <label class="flex items-center gap-1"><input v-model="conflictChoice" type="radio" value="new" /> 保留新值</label>
            <label class="flex items-center gap-1"><input v-model="conflictChoice" type="radio" value="old" /> 保留旧值</label>
            <label class="flex items-center gap-1"><input v-model="conflictChoice" type="radio" value="skip" /> 跳过</label>
          </div>
          <ul class="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-900/[0.04] p-2 text-xs dark:bg-white/[0.06]">
            <li v-for="(c, i) in conflicts" :key="i" class="flex gap-2">
              <span class="truncate text-slate-600 dark:text-slate-300">{{ c.item.title }}（{{ hostOf(c.item.url) }}）</span>
              <span class="ml-auto shrink-0 text-slate-400">现属 {{ catNameOf(c.existing.cat) }}</span>
            </li>
          </ul>
        </div>

        <p v-if="importError" class="text-xs text-red-500">{{ importError }}</p>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" :class="BTN_SECONDARY" :disabled="phase === 'applying'" @click="cancelImport">取消</button>
          <button type="button" :class="BTN_PRIMARY" :disabled="phase === 'applying' || (!added.length && (conflictChoice !== 'new' || !conflicts.length))" @click="confirmImport">
            {{ phase === 'applying' ? '导入中…' : `确认导入（新增 ${added.length} 条）` }}
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>
