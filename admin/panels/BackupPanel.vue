<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AdminIcon from '../components/AdminIcon.vue';
import CardHead from '../components/CardHead.vue';
import PageHead from '../components/PageHead.vue';
import { api, ApiError } from '../lib/adminApi';
import { formatBytes, formatTime } from '../lib/util';
import { mutate, reload, commitCurrent, state, toast } from '../lib/adminStore';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  INPUT,
  LABEL,
  LINK_BTN,
  LINK_DANGER,
  PAGE,
  TABLE,
  THEAD,
  TH,
  TD,
  ROW,
} from '../lib/adminUi';
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
    await commitCurrent();
  } finally {
    saving.value = false;
  }
}

onMounted(loadSnapshots);

/* 类名统一走 admin/lib/adminUi.ts（玻璃面 + accent 令牌，与前台同语言） */
const inputCls = INPUT;
const labelCls = LABEL;
const cardCls = CARD + ' flex flex-col overflow-hidden';
const ghostBtn = BTN_SECONDARY;
const thCls = TH;
const tdCls = TD;
</script>

<template>
  <div :class="PAGE + ' lg:flex lg:h-full lg:flex-col'">
    <!-- 页面标题卡：一级分类 / 二级分类 / 说明全部派生自 lib/panels.ts（与左侧导航同步） -->
    <PageHead panel="backup" class="lg:shrink-0" />

    <!-- 上下排列：上 = 自动备份策略（紧凑）；下 = 快照（通底、内部滚动） -->
    <div class="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
      <!-- ① 自动备份策略：模式 / 频率 / 保留份数 同一行 -->
      <div :class="cardCls">
        <CardHead title="自动备份策略">
          <button
            type="button"
            :class="BTN_PRIMARY + ' shrink-0'"
            :disabled="!state.dirty || state.saving || saving"
            @click="saveNow"
          >
            {{ state.saving || saving ? '保存中…' : '保存' }}
          </button>
        </CardHead>
        <div class="p-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          <span class="mt-3 block text-xs text-slate-500">{{ state.dirty ? '有未保存的更改' : '所有更改已保存' }}</span>
        </div>
      </div>

      <!-- ② 快照：通底（lg 起撑满剩余高度、内部滚动）；标题行右侧 = 刷新 + 存一份快照（主操作） -->
      <div :class="cardCls + ' lg:min-h-0 lg:flex-1'">
        <CardHead title="快照" :count="snaps.length + ' 份'">
          <button type="button" :class="ghostBtn + ' shrink-0'" :disabled="snapsLoading" @click="loadSnapshots">
            刷新
          </button>
          <button type="button" :class="BTN_PRIMARY + ' shrink-0'" :disabled="snapshotBusy" @click="takeSnapshot">
            <AdminIcon name="plus" :size="13" />{{ snapshotBusy ? '保存中…' : '存一份快照' }}
          </button>
        </CardHead>
        <!-- 快照表格：列 = 时间 / 大小 / 分类数 / 链接数 / 操作，与「链接列表」同款表样式 -->
        <div class="overflow-auto lg:min-h-0 lg:flex-1">
          <p v-if="snapsError" class="p-4 text-xs text-amber-600 dark:text-amber-400">{{ snapsError }}</p>
          <table v-else :class="TABLE + ' min-w-[640px] text-center'">
            <thead :class="THEAD">
              <tr>
                <th :class="thCls + ' w-[1%] whitespace-nowrap'">时间</th>
                <th :class="thCls + ' w-1/3'">大小</th>
                <th :class="thCls + ' w-1/3'">分类数</th>
                <th :class="thCls + ' w-1/3'">链接数</th>
                <th :class="thCls + ' w-[1%] whitespace-nowrap'">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in snaps" :key="s.key" :class="ROW">
                <td :class="tdCls + ' whitespace-nowrap'">{{ formatTime(s.at) }}</td>
                <td :class="tdCls + ' text-xs text-slate-400'">{{ formatBytes(s.size) }}</td>
                <td :class="tdCls + ' text-xs text-slate-400'">{{ s.categories ?? '—' }}</td>
                <td :class="tdCls + ' text-xs text-slate-400'">{{ s.links ?? '—' }}</td>
                <td :class="tdCls + ' whitespace-nowrap'">
                  <button type="button" :class="LINK_BTN" @click="restoreSnapshot(s.key)">恢复</button>
                  <button type="button" class="ml-2" :class="LINK_DANGER" @click="removeSnapshot(s.key)">删除</button>
                </td>
              </tr>
              <tr v-if="!snaps.length">
                <td :class="tdCls + ' text-center text-slate-400'" colspan="5">
                  {{ snapsLoading ? '加载中…' : '还没有快照，点上方「存一份快照」。' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
