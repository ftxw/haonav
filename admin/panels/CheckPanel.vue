<script setup lang="ts">
import { computed, ref } from 'vue';
import AdminIcon from '../components/AdminIcon.vue';
import CardHead from '../components/CardHead.vue';
import PageHead from '../components/PageHead.vue';
import { checkLinks, type CheckMode, type CheckResult } from '../lib/checkLinks';
import { hostOf } from '../lib/util';
import { commit, state, toast } from '../lib/adminStore';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  INPUT_BASE,
  LINK_DANGER,
  PAGE,
  SPINNER,
  TAG_DANGER,
} from '../lib/adminUi';
import type { LinkItem } from '../../shared/types';

const catNameOf = (id: string): string =>
  id === '' ? '未分类' : (state.doc?.categories.find((c) => c.id === id)?.name ?? id);

/* ═══════════════════════ ① 重复链接检测 ═══════════════════════ */

interface DupGroup {
  urlKey: string;
  items: LinkItem[];
}
const dupes = ref<DupGroup[]>([]);

const dupesFound = computed(() => dupes.value.reduce((n, g) => n + g.items.length - 1, 0));
const dupesScanned = ref(false);

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
  dupesScanned.value = true;
}

function removeDupeExtra(group: DupGroup, keepId?: string): void {
  const keep = keepId ?? group.items[0].id;
  const ids = new Set(group.items.filter((l) => l.id !== keep).map((l) => l.id));
  void commit((d) => {
    d.links = d.links.filter((l) => !ids.has(l.id));
  });
  findDupes();
  toast(`已删除 ${ids.size} 条重复项`);
}

/**
 * 一次清理所有重复组（每组保留第一条）。
 * ⚠️ 必须**合并成单次 commit** —— `commit()` 是乐观更新 + `rev` 冲突检测，
 * 在 forEach 里逐个调用会拿同一个 rev 并发打多个 PATCH，除第一个外全部 409。
 */
function removeAllDupes(): void {
  const ids = new Set<string>();
  for (const g of dupes.value) for (const l of g.items.slice(1)) ids.add(l.id);
  if (!ids.size) return;
  if (!window.confirm(`保留每组第一条，删除其余 ${ids.size} 条？删除将立即保存。`)) return;
  void commit((d) => {
    d.links = d.links.filter((l) => !ids.has(l.id));
  });
  findDupes();
  toast(`已删除 ${ids.size} 条重复项`);
}

/* ═══════════════════════ ② 死链检测 ═══════════════════════ */

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
  const urls = d.links.filter((l) => (deadScope.value === 'all' ? true : !l.desc)).map((l) => l.url);
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
  if (!window.confirm(`删除 ${bad.size} 条检测失败的链接？检测结果不代表永久失效，删除将立即保存。`)) return;
  void commit((d) => {
    d.links = d.links.filter((l) => !bad.has(l.url));
  });
  deadResults.value = deadResults.value.filter((r) => !bad.has(r.url));
  toast('已删除失效链接');
}
</script>

<template>
  <div :class="PAGE + ' lg:flex lg:h-full lg:flex-col'">
    <!-- 页面标题卡：一级分类 / 二级分类 / 说明全部派生自 lib/panels.ts（与左侧导航同步） -->
    <PageHead panel="check" class="lg:shrink-0" />

    <!-- 两块检测卡左右并排（lg 起等高，通到页面底部，卡内独立滚动） -->
    <div class="grid items-start gap-4 lg:min-h-0 lg:flex-1 lg:items-stretch lg:gap-5 lg:grid-cols-2">
      <!-- 左卡：重复链接检测 -->
      <div :class="CARD + ' flex flex-col overflow-hidden'">
        <CardHead title="重复链接检测">
          <button type="button" :class="BTN_SECONDARY + ' shrink-0'" @click="findDupes">
            <AdminIcon name="copy" :size="13" />开始检测
          </button>
        </CardHead>

        <div class="space-y-2 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <div v-if="dupes.length" class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-slate-500">{{ dupes.length }} 组 / {{ dupesFound }} 条冗余</span>
            <button type="button" :class="BTN_DANGER + ' ml-auto shrink-0'" @click="removeAllDupes">
              <AdminIcon name="trash" :size="13" />保留第一条，删除其余
            </button>
          </div>

          <p v-if="dupesScanned && !dupes.length" class="text-xs text-slate-400">没有发现重复链接。</p>

          <ul v-if="dupes.length" class="space-y-2">
            <li
              v-for="g in dupes"
              :key="g.urlKey"
              class="rounded-lg bg-slate-900/[0.04] px-3 py-2 text-xs dark:bg-white/[0.06]"
            >
              <div class="flex items-center gap-2">
                <span class="font-medium text-slate-600 dark:text-slate-300">{{
                  hostOf(g.urlKey.startsWith('http') ? g.urlKey : 'https://' + g.urlKey)
                }}</span>
                <span class="text-slate-400">{{ g.items.length }} 条</span>
                <button type="button" class="ml-auto" :class="LINK_DANGER" @click="removeDupeExtra(g)">
                  保留第一条，删除其余
                </button>
              </div>
              <ul class="mt-1 space-y-0.5 pl-3 text-slate-500">
                <li v-for="l in g.items" :key="l.id" class="flex gap-2">
                  <span class="truncate">{{ l.title }}</span>
                  <span class="ml-auto shrink-0 text-slate-400">{{ catNameOf(l.cat) }}</span>
                  <button type="button" class="shrink-0" :class="LINK_DANGER" @click="removeDupeExtra(g, l.id)">
                    删除此条
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>

      <!-- 右卡：死链检测 -->
      <div :class="CARD + ' flex flex-col overflow-hidden'">
        <CardHead title="死链检测">
          <select v-model="deadScope" :class="INPUT_BASE + ' w-40 shrink-0'">
            <option value="all">全部链接</option>
            <option value="nodesc">仅无描述的链接</option>
          </select>
          <button type="button" :class="BTN_PRIMARY + ' shrink-0'" :disabled="deadRunning" @click="runDeadCheck">
            <AdminIcon :name="deadRunning ? 'loader' : 'activity'" :size="13" :class="deadRunning ? SPINNER : ''" />{{ deadRunning ? '检测中…' : '开始检测' }}
          </button>
        </CardHead>

        <div class="space-y-2 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <div v-if="deadTotal" class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <AdminIcon v-if="deadRunning" name="loader" :size="13" :class="SPINNER" />
              进度 {{ deadDone }}/{{ deadTotal }}
            </span>
            <span
              v-if="!deadRunning && deadResults.length"
              class="text-xs"
              :class="deadMode === 'server' ? 'text-slate-400' : 'text-amber-500'"
            >
              {{ deadMode === 'server' ? '' : '（浏览器端探测，仅能发现连接级失败）' }}失效 {{ deadFailed.length }} 条
            </span>
            <button
              v-if="!deadRunning && deadFailed.length"
              type="button"
              :class="BTN_DANGER + ' ml-auto shrink-0'"
              @click="removeDead"
            >
              <AdminIcon name="trash" :size="13" />删除全部失效项
            </button>
          </div>

          <p v-if="deadTotal && !deadRunning && !deadFailed.length" class="text-xs text-slate-400">没有发现失效链接。</p>

          <ul v-if="deadFailed.length" class="space-y-1">
            <li
              v-for="r in deadFailed"
              :key="r.url"
              class="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs"
            >
              <span class="truncate text-slate-600 dark:text-slate-300">{{ r.url }}</span>
              <span class="ml-auto shrink-0" :class="TAG_DANGER">{{ r.status ? 'HTTP ' + r.status : '无响应' }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
