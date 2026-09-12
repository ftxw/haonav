<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from '../components/Modal.vue';
import AdminIcon from '../components/AdminIcon.vue';
import { api } from '../lib/adminApi';
import { parseBookmarksHtml, type ParsedItem } from '../lib/importParse';
import { checkLinks, type CheckMode, type CheckResult } from '../lib/checkLinks';
import { slugId, hostOf, maxOrderOf } from '../lib/util';
import { mutate, reload, save, state, toast } from '../lib/adminStore';
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
  id === '' ? '（未分类）' : (state.doc?.categories.find((c) => c.id === id)?.name ?? id);

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
  mutate((d) => {
    d.categories = parsed.categories as typeof d.categories;
    d.links = parsed.links as typeof d.links;
    if (parsed.settings && typeof parsed.settings === 'object') d.settings = parsed.settings as typeof d.settings;
  });
  await save();
  toast('已从 JSON 备份还原');
  phase.value = 'idle';
}

/** 分批（≤200）调用 /api/import/parse 聚合 diff，不落库 */
async function diffItems(items: ParsedItem[]): Promise<void> {
  phase.value = 'diffing';
  const catIds = new Map<string, string>(state.doc?.categories.map((c) => [c.name, c.id]) ?? []);
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
    conflictAll.push(...res.conflict);
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
    .map(([id, count]) => ({ name: id === '' ? '（未分类）' : catNameOf(id), count }))
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
      mutate((d) => {
        let last = maxOrderOf(d.categories.map((c) => c.order));
        for (const name of needNames) {
          const id = slugId('imp', name);
          last = last ? last + '1' : 'V';
          d.categories.push({ id, name, icon: { type: 'letter' }, order: last });
          nameToId.set(name, id);
        }
      });
      if (!(await save())) throw new Error('创建分类失败，导入已取消');
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
      mutate((d) => {
        for (const l of d.links) {
          const ex = byKey.get(l.urlKey);
          if (!ex) continue;
          const src = conflicts.value.find((c) => c.existing.id === l.id)?.item;
          if (!src) continue;
          l.title = src.title;
          if (src.desc) l.desc = src.desc;
        }
      });
      await save();
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

/* ═══════════════════════ ② 快照 / 导出 → 已拆到 BackupPanel ═══════════════════════ */

/* ═══════════════════════ ③ 重复链接检测 ═══════════════════════ */

interface DupGroup {
  urlKey: string;
  items: LinkItem[];
}
const dupes = ref<DupGroup[]>([]);

const dupesFound = computed(() => dupes.value.reduce((n, g) => n + g.items.length - 1, 0));

function findDupes(): void {
  const d = state.doc;
  if (!d) return;
  const map = new Map<string, LinkItem[]>();
  for (const l of d.links) {
    const arr = map.get(l.urlKey) ?? [];
    arr.push(l);
    map.set(l.urlKey, arr);
  }
  dupes.value = [...map.values()].filter((a) => a.length > 1).map((items) => ({ urlKey: items[0].urlKey, items }));
}

function removeDupeExtra(group: DupGroup, keepId?: string): void {
  const keep = keepId ?? group.items[0].id;
  const ids = new Set(group.items.filter((l) => l.id !== keep).map((l) => l.id));
  mutate((d) => {
    d.links = d.links.filter((l) => !ids.has(l.id));
  });
  findDupes();
  toast(`已删除 ${ids.size} 条重复项`);
}

/* ═══════════════════════ ⑤ 死链检测 ═══════════════════════ */

const deadRunning = ref(false);
const deadDone = ref(0);
const deadTotal = ref(0);
const deadResults = ref<CheckResult[]>([]);
const deadMode = ref<CheckMode>('server');
const deadScope = ref<'all' | 'nodesc'>('all');

const deadFailed = computed(() => deadResults.value.filter((r) => !r.ok));

async function runDeadCheck(): Promise<void> {
  const d = state.doc;
  if (!d) return;
  const urls = d.links
    .filter((l) => (deadScope.value === 'all' ? true : !l.desc))
    .map((l) => l.url);
  if (!urls.length) return;
  deadRunning.value = true;
  deadDone.value = 0;
  deadTotal.value = urls.length;
  deadResults.value = [];
  try {
    deadMode.value = await checkLinks(urls, (results) => {
      deadResults.value = deadResults.value.concat(results);
      deadDone.value = deadResults.value.length;
    });
  } catch (e) {
    toast(e instanceof Error ? e.message : '检测失败');
  } finally {
    deadRunning.value = false;
  }
}

function removeDead(): void {
  const bad = new Set(deadFailed.value.map((r) => r.url));
  if (!bad.size) return;
  if (!window.confirm(`删除 ${bad.size} 条检测失败的链接？检测结果不代表永久失效，可撤销（Ctrl+Z）。`)) return;
  mutate((d) => {
    d.links = d.links.filter((l) => !bad.has(l.url));
  });
  deadResults.value = deadResults.value.filter((r) => !bad.has(r.url));
  toast('已删除失效链接');
}

const btnCls =
  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const inputCls =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const cardCls = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';
const titleCls = 'text-sm font-bold text-slate-800 dark:text-slate-100';
const descCls = 'mt-0.5 text-xs text-slate-500 dark:text-slate-400';
</script>

<template>
  <div class="space-y-4">
    <!-- ① 导入 -->
    <div :class="cardCls">
      <h3 :class="titleCls">导入书签</h3>
      <p :class="descCls">支持浏览器导出的 Netscape HTML 书签文件（Web Worker 解析，不卡界面），或本工具导出的 JSON 备份（整体还原）。</p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <input ref="fileInput" type="file" accept=".html,.htm,.json" class="hidden" @change="onFile" />
        <button type="button" :class="btnCls + ' bg-emerald-600 text-white hover:bg-emerald-700'" :disabled="phase !== 'idle'" @click="fileInput?.click()">
          选择文件…
        </button>
        <label class="flex items-center gap-1.5 text-xs text-slate-500">
          无文件夹条目归入
          <select v-model="noFolderCat" :class="inputCls + ' !py-1 text-xs'">
            <option value="__none__">（未分类）</option>
            <option v-for="c in state.doc?.categories ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <span v-if="phase === 'parsing' || phase === 'diffing' || phase === 'applying'" class="text-xs text-emerald-600 dark:text-emerald-400">{{ progressText }}</span>
      </div>
      <p v-if="importError" class="mt-2 text-xs text-red-500">{{ importError }}</p>
    </div>

    <!-- ② 导出 -->
    <div :class="cardCls">
      <h3 :class="titleCls">导出</h3>
      <p :class="descCls">下载完整备份（JSON 可一键还原）或标准书签 HTML。</p>
      <div class="mt-3 flex gap-2">
        <a :href="api.exportUrl('json')" :class="btnCls + ' bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200'">
          <span class="flex items-center gap-1.5"><AdminIcon name="download" :size="13" /> 导出 JSON</span>
        </a>
        <a :href="api.exportUrl('html')" :class="btnCls + ' bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200'">
          <span class="flex items-center gap-1.5"><AdminIcon name="download" :size="13" /> 导出 HTML 书签</span>
        </a>
      </div>
    </div>

    <!-- ③ 重复链接 -->
    <div :class="cardCls">
      <div class="flex items-center gap-2">
        <h3 :class="titleCls">重复链接检测</h3>
        <button type="button" :class="btnCls + ' ml-auto bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200'" @click="findDupes">开始检测</button>
        <span v-if="dupes.length" class="text-xs text-slate-500">{{ dupes.length }} 组 / {{ dupesFound }} 条冗余</span>
      </div>
      <p :class="descCls">同一规范化网址（urlKey）出现多次即为重复。</p>
      <ul v-if="dupes.length" class="mt-3 max-h-64 space-y-2 overflow-y-auto">
        <li v-for="g in dupes" :key="g.urlKey" class="rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
          <div class="flex items-center gap-2">
            <span class="font-medium text-slate-600 dark:text-slate-300">{{ hostOf(g.urlKey.startsWith('http') ? g.urlKey : 'https://' + g.urlKey) }}</span>
            <span class="text-slate-400">{{ g.items.length }} 条</span>
            <button type="button" class="ml-auto text-red-500 hover:underline" @click="removeDupeExtra(g)">保留第一条，删除其余</button>
          </div>
          <ul class="mt-1 space-y-0.5 pl-3 text-slate-500">
            <li v-for="l in g.items" :key="l.id" class="flex gap-2">
              <span class="truncate">{{ l.title }}</span>
              <span class="ml-auto shrink-0 text-slate-400">{{ catNameOf(l.cat) }}</span>
              <button type="button" class="shrink-0 text-red-500 hover:underline" @click="removeDupeExtra(g, l.id)">删除此条</button>
            </li>
          </ul>
        </li>
      </ul>
    </div>

    <!-- ③ 死链检测 -->
    <div :class="cardCls">
      <div class="flex flex-wrap items-center gap-2">
        <h3 :class="titleCls">死链检测</h3>
        <select v-model="deadScope" :class="inputCls + ' !py-1 text-xs'">
          <option value="all">全部链接</option>
          <option value="nodesc">仅无描述的链接</option>
        </select>
        <button type="button" :class="btnCls + ' bg-emerald-600 text-white hover:bg-emerald-700'" :disabled="deadRunning" @click="runDeadCheck">
          {{ deadRunning ? '检测中…' : '开始检测' }}
        </button>
        <span v-if="deadTotal" class="text-xs text-slate-500">{{ deadDone }}/{{ deadTotal }}</span>
        <span v-if="!deadRunning && deadResults.length" class="text-xs" :class="deadMode === 'server' ? 'text-slate-400' : 'text-amber-500'">
          {{ deadMode === 'server' ? '' : '（浏览器端探测，仅能发现连接级失败）' }}失效 {{ deadFailed.length }} 条
        </span>
        <button
          v-if="!deadRunning && deadFailed.length"
          type="button"
          :class="btnCls + ' ml-auto bg-red-500 text-white hover:bg-red-600'"
          @click="removeDead"
        >
          删除全部失效项
        </button>
      </div>
      <p :class="descCls">每请求最多 20 条、多轮进行；结果只在本会话展示，不会写进文档。</p>
      <ul v-if="deadFailed.length" class="mt-3 max-h-56 space-y-1 overflow-y-auto">
        <li v-for="r in deadFailed" :key="r.url" class="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs dark:bg-red-950/30">
          <span class="truncate text-slate-600 dark:text-slate-300">{{ r.url }}</span>
          <span class="ml-auto shrink-0 text-red-500">{{ r.status ? 'HTTP ' + r.status : '无响应' }}</span>
        </li>
      </ul>
    </div>

    <!-- 导入预览 -->
    <Modal v-if="phase === 'preview' || phase === 'applying'" title="导入预览" wide @close="phase !== 'applying' && cancelImport()">
      <div class="space-y-4 text-sm">
        <div class="flex flex-wrap gap-2">
          <span class="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">新增 {{ added.length }}</span>
          <span class="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">已存在 {{ existingCount }}</span>
          <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">冲突 {{ conflicts.length }}</span>
        </div>

        <div v-if="addedByCat.length">
          <p class="mb-1 text-xs font-medium text-slate-500">新增条目按分类</p>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="g in addedByCat" :key="g.name" class="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
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
          <ul class="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
            <li v-for="(c, i) in conflicts" :key="i" class="flex gap-2">
              <span class="truncate text-slate-600 dark:text-slate-300">{{ c.item.title }}（{{ hostOf(c.item.url) }}）</span>
              <span class="ml-auto shrink-0 text-slate-400">现属 {{ catNameOf(c.existing.cat) }}</span>
            </li>
          </ul>
        </div>

        <p v-if="importError" class="text-xs text-red-500">{{ importError }}</p>

        <div class="flex justify-end gap-2 pt-1">
          <button type="button" :class="btnCls + ' bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200'" :disabled="phase === 'applying'" @click="cancelImport">取消</button>
          <button type="button" :class="btnCls + ' bg-emerald-600 text-white hover:bg-emerald-700'" :disabled="phase === 'applying' || (!added.length && (conflictChoice !== 'new' || !conflicts.length))" @click="confirmImport">
            {{ phase === 'applying' ? '导入中…' : `确认导入（新增 ${added.length} 条）` }}
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>
