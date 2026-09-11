<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AdminIcon from '../components/AdminIcon.vue';
import { api, ApiError } from '../lib/adminApi';
import { formatBytes, formatTime } from '../lib/util';
import { reload, state, toast } from '../lib/adminStore';
import type { SnapshotMeta } from '../../shared/types';

/* ── 导出：完整备份 JSON（可一键还原）/ 标准书签 HTML ── */

/* ── 快照：列表 / 新建 / 恢复（存于 KV，保留策略见「设置」） ── */

const snaps = ref<SnapshotMeta[]>([]);
const snapsError = ref('');
const snapsLoading = ref(false);
const snapshotBusy = ref(false);

async function takeSnapshot(): Promise<void> {
  snapshotBusy.value = true;
  try {
    const r = await api.snapshot();
    toast(`快照已保存（共 ${r.count} 份）`);
    await loadSnapshots();
  } catch (e) {
    toast(e instanceof Error ? e.message : '快照失败');
  } finally {
    snapshotBusy.value = false;
  }
}

async function loadSnapshots(): Promise<void> {
  snapsLoading.value = true;
  snapsError.value = '';
  try {
    snaps.value = (await api.snapshots()).snapshots ?? [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) snapsError.value = '快照列表接口未就绪（等待后端 GET /api/backup/snapshots）';
    else snapsError.value = e instanceof Error ? e.message : '读取快照失败';
  } finally {
    snapsLoading.value = false;
  }
}

async function restoreSnapshot(key: string): Promise<void> {
  if (!window.confirm('恢复会覆盖当前数据。恢复前服务端会自动保存当前状态为一份快照。确认恢复？')) return;
  try {
    await api.restore(key);
    await reload();
    toast('已恢复');
  } catch (e) {
    toast(e instanceof Error ? e.message : '恢复失败');
  }
}

onMounted(loadSnapshots);

const btnCls =
  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const cardCls = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';
const titleCls = 'text-sm font-bold text-slate-800 dark:text-slate-100';
const descCls = 'mt-0.5 text-xs text-slate-500 dark:text-slate-400';
const ghostBtn = btnCls + ' bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200';
</script>

<template>
  <div class="space-y-4">
    <!-- 导出 -->
    <div :class="cardCls">
      <h3 :class="titleCls">导出</h3>
      <p :class="descCls">下载完整备份（JSON 可在「数据 → 导入」一键还原）或标准书签 HTML。</p>
      <div class="mt-3 flex gap-2">
        <a :href="api.exportUrl('json')" :class="ghostBtn">
          <span class="flex items-center gap-1.5"><AdminIcon name="download" :size="13" /> 导出 JSON</span>
        </a>
        <a :href="api.exportUrl('html')" :class="ghostBtn">
          <span class="flex items-center gap-1.5"><AdminIcon name="download" :size="13" /> 导出 HTML 书签</span>
        </a>
      </div>
    </div>

    <!-- 快照 -->
    <div :class="cardCls">
      <div class="flex items-center gap-2">
        <h3 :class="titleCls">快照</h3>
        <span class="text-xs text-slate-400">{{ snaps.length }} 份</span>
        <button
          type="button"
          :class="btnCls + ' ml-auto bg-emerald-600 text-white hover:bg-emerald-700'"
          :disabled="snapshotBusy"
          @click="takeSnapshot"
        >
          {{ snapshotBusy ? '保存中…' : '存一份快照' }}
        </button>
        <button type="button" :class="ghostBtn" :disabled="snapsLoading" @click="loadSnapshots">刷新</button>
      </div>
      <p :class="descCls">
        快照存于 KV（自动清理策略见「设置 → 备份」，当前：{{ state.doc?.settings.backup.mode === 'auto' ? '自动' : '手动' }}）；恢复前服务端会自动把当前状态另存一份。
      </p>
      <p v-if="snapsError" class="mt-2 text-xs text-amber-600 dark:text-amber-400">{{ snapsError }}</p>
      <p v-else-if="!snaps.length && !snapsLoading" class="mt-3 text-xs text-slate-400">还没有快照，点右上角「存一份快照」。</p>
      <ul v-else-if="snaps.length" class="mt-3 max-h-56 space-y-1 overflow-y-auto">
        <li
          v-for="s in snaps"
          :key="s.key"
          class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60"
        >
          <span class="text-slate-600 dark:text-slate-300">{{ formatTime(s.at) }}</span>
          <span class="text-slate-400">{{ formatBytes(s.size) }}</span>
          <button type="button" class="ml-auto text-emerald-600 hover:underline dark:text-emerald-400" @click="restoreSnapshot(s.key)">
            恢复
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
