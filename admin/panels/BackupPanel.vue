<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AdminIcon from '../components/AdminIcon.vue';
import { api, ApiError } from '../lib/adminApi';
import { formatBytes, formatTime } from '../lib/util';
import { mutate, reload, save, state, toast } from '../lib/adminStore';
import type { SiteSettings, SnapshotMeta } from '../../shared/types';

/* ── ① 自动备份策略：开关（auto/manual）+ 频率 + 保留份数 ── */

const settings = computed<SiteSettings | null>(() => state.doc?.settings ?? null);

function patch(fn: (s: SiteSettings) => void): void {
  mutate((d) => {
    if (d.settings) fn(d.settings);
  });
}
const setBackupMode = (v: string): void =>
  patch((s) => (s.backup = { ...s.backup, mode: v as SiteSettings['backup']['mode'] }));
const setBackupFreq = (v: string): void =>
  patch((s) => (s.backup = { ...s.backup, frequency: v as SiteSettings['backup']['frequency'] }));
const setRetention = (v: number): void =>
  patch((s) => (s.backup = { ...s.backup, retention: Math.max(1, Math.min(30, v || 7)) }));

/* ── ② 快照：存 / 列表 / 恢复 / 删除 ── */

const snaps = ref<SnapshotMeta[]>([]);
const snapsError = ref('');
const snapsLoading = ref(false);
const snapshotBusy = ref(false);
const saving = ref(false);

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

/**
 * 删除单份快照：后端 DELETE /api/backup/snapshot 未就绪时给降级提示，不报错
 * （接口补齐后这里无需改动）。
 */
async function removeSnapshot(key: string): Promise<void> {
  if (!window.confirm('删除这份快照？删除后不可恢复。')) return;
  try {
    const res = await fetch('/api/backup/snapshot', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      toast('后端暂不支持删除快照（等待 DELETE /api/backup/snapshot）');
      return;
    }
    if (!res.ok) {
      toast(`删除失败（HTTP ${res.status}）`);
      return;
    }
    toast('快照已删除');
    await loadSnapshots();
  } catch (e) {
    toast(e instanceof Error ? e.message : '删除失败');
  }
}

async function saveNow(): Promise<void> {
  saving.value = true;
  try {
    await save();
  } finally {
    saving.value = false;
  }
}

onMounted(loadSnapshots);

const btnCls =
  'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const labelCls = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';
const cardCls = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800';
const titleCls = 'text-sm font-bold text-slate-800 dark:text-slate-100';
const descCls = 'mt-0.5 text-xs text-slate-500 dark:text-slate-400';
const ghostBtn = btnCls + ' bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200';
</script>

<template>
  <div class="space-y-4">
    <!-- ① 自动备份策略 -->
    <div :class="cardCls">
      <h3 :class="titleCls">自动备份策略</h3>
      <p :class="descCls">服务端按此策略自动存快照；「手动」模式只在点「存一份快照」时生成。</p>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <label class="block">
          <span :class="labelCls">模式</span>
          <select
            v-if="settings"
            :value="settings.backup.mode"
            :class="inputCls"
            @change="setBackupMode(($event.target as HTMLSelectElement).value)"
          >
            <option value="auto">自动</option>
            <option value="manual">手动</option>
          </select>
        </label>
        <label class="block">
          <span :class="labelCls">频率</span>
          <select
            v-if="settings"
            :value="settings.backup.frequency"
            :class="inputCls"
            @change="setBackupFreq(($event.target as HTMLSelectElement).value)"
          >
            <option value="daily">每天</option>
            <option value="weekly">每周</option>
          </select>
        </label>
        <label class="block">
          <span :class="labelCls">保留份数（1–30）</span>
          <input
            v-if="settings"
            type="number"
            min="1"
            max="30"
            :value="settings.backup.retention"
            :class="inputCls"
            @input="setRetention(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          :disabled="!state.dirty || state.saving || saving"
          @click="saveNow"
        >
          {{ state.saving || saving ? '保存中…' : '保存备份策略' }}
        </button>
        <span class="text-xs text-slate-500">{{ state.dirty ? '有未保存的更改' : '所有更改已保存' }}</span>
      </div>
    </div>

    <!-- ② 快照 -->
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
          <span class="flex items-center gap-1.5">
            <AdminIcon name="plus" :size="13" />{{ snapshotBusy ? '保存中…' : '存一份快照' }}
          </span>
        </button>
        <button type="button" :class="ghostBtn" :disabled="snapsLoading" @click="loadSnapshots">刷新</button>
      </div>
      <p :class="descCls">快照存于 KV，当前保留 {{ settings?.backup.retention ?? 7 }} 份；恢复前服务端会自动把当前状态另存一份。</p>
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
          <button
            type="button"
            class="ml-auto text-emerald-600 hover:underline dark:text-emerald-400"
            @click="restoreSnapshot(s.key)"
          >
            恢复
          </button>
          <button type="button" class="text-red-500 hover:underline" @click="removeSnapshot(s.key)">删除</button>
        </li>
      </ul>
    </div>
  </div>
</template>
