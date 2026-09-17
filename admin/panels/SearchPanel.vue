<script setup lang="ts">
import { computed, ref } from 'vue';
import AdminIcon from '../components/AdminIcon.vue';
import CardHead from '../components/CardHead.vue';
import Modal from '../components/Modal.vue';
import PageHead from '../components/PageHead.vue';
import { commit, state, toast } from '../lib/adminStore';
import { newId } from '../lib/util';
import { dragIdAt, useTouchDrag } from '../lib/useTouchDrag';
import { engineIconSrc } from '../../web/lib/brandIcon';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  INPUT,
  INPUT_BASE,
  LINK_DANGER,
  PAGE,
  TABLE,
  THEAD,
  TH,
  TD,
  ROW,
} from '../lib/adminUi';
import type { SearchEngine, SiteSettings } from '../../shared/types';

const settings = computed<SiteSettings | null>(() => state.doc?.settings ?? null);
const engines = computed(() => settings.value?.searchEngines ?? []);

/* ── 引擎图标：与前台搜索框、链接卡片同一套规则（settings.iconStrategy 决定 letter / 抓取） ── */
const strategy = computed(() => settings.value?.iconStrategy ?? 'letter');
/** 图标服务地址（站点设置 iconApi，可换自建/镜像；缺省回退默认） */
const iconApi = computed(() => settings.value?.iconApi ?? '');
const iconFail = ref<Record<string, boolean>>({});
const iconOf = (e: SearchEngine): string => engineIconSrc(e, strategy.value, !!iconFail.value[e.id], iconApi.value);
const markIconFail = (id: string): void => {
  iconFail.value[id] = true;
};

/**
 * 改 settings 并**立即落库** —— 与「链接管理」面板同一模型：
 * 走 `commit()`，由 diffOps 自动生成 settings.update，所以本面板**不再需要「保存」按钮**。
 */
function patch(fn: (s: SiteSettings) => void): void {
  commit((d) => {
    if (d.settings) fn(d.settings);
  });
}

/* ── 添加搜索引擎：弹窗形式，按钮样式与「添加链接」保持一致 ── */
const addOpen = ref(false);
const form = ref({ name: '', url: '', icon: '' });
const formError = ref('');

/** 弹窗内的图标预览：与列表同一套取图规则，方便边填边看 */
const formIconPreview = computed(() =>
  engineIconSrc({ name: form.value.name || '?', url: form.value.url, icon: form.value.icon }, strategy.value, false, iconApi.value),
);

function openAdd(): void {
  form.value = { name: '', url: 'https://', icon: '' };
  formError.value = '';
  addOpen.value = true;
}

function submitAdd(): void {
  const name = form.value.name.trim();
  const url = form.value.url.trim();
  const icon = form.value.icon.trim();
  if (!name) {
    formError.value = '请输入引擎名称';
    return;
  }
  if (!/^https?:\/\/\S+$/i.test(url)) {
    formError.value = '网址需以 http(s):// 开头';
    return;
  }
  if (icon && !/^https?:\/\/\S+$/i.test(icon)) {
    formError.value = '图标地址需以 http(s):// 开头（留空则自动抓取）';
    return;
  }
  const eng: SearchEngine = { id: newId(), name, url, ...(icon ? { icon } : {}) };
  patch((s) => {
    s.searchEngines = [...s.searchEngines, eng];
  });
  addOpen.value = false;
  toast('已添加搜索引擎');
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
/* ── 拖拽排序（顺序即前台引擎下拉的顺序；引擎无 order 字段，直接重排数组，复刻链接列表落库语义） ──
   鼠标：原生 HTML5 DnD；触屏：拖拽柄上的指针手势（见 useTouchDrag），避免与原生滚动打架。 */
const touch = useTouchDrag({ onDrop: (from, to) => reorderEngines(from, to), resolveId: dragIdAt });
const dragId = touch.dragId;
const dragOverId = touch.overId;

function onDragStart(id: string, e: DragEvent): void {
  dragId.value = id;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(id: string, e: DragEvent): void {
  e.preventDefault();
  dragOverId.value = id;
}
function onDragLeave(id: string): void {
  if (dragOverId.value === id) dragOverId.value = null;
}
function onDrop(targetId: string, e: DragEvent): void {
  e.preventDefault();
  const id = dragId.value;
  dragId.value = null;
  dragOverId.value = null;
  if (!id || id === targetId) return;
  reorderEngines(id, targetId);
}
/** 拖拽落点语义与链接列表一致：原位置在上→落点之后；原位置在下→落点之前 */
function reorderEngines(id: string, targetId: string): void {
  patch((s) => {
    const list = s.searchEngines;
    const from = list.findIndex((e) => e.id === id);
    const to = list.findIndex((e) => e.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const ordered = list.slice();
    const [moved] = ordered.splice(from, 1);
    const tIndex = ordered.findIndex((e) => e.id === targetId);
    ordered.splice(from < to ? tIndex + 1 : tIndex, 0, moved);
    s.searchEngines = ordered;
  });
}

/* 类名统一走 admin/lib/adminUi.ts（内容面 + accent 令牌，与其它面板同语言） */
const inputCls = INPUT;
const thCls = TH;
const tdCls = TD;
</script>

<template>
  <div :class="PAGE + ' lg:flex lg:h-full lg:flex-col'">
    <!-- 页面标题卡：一级分类 / 二级分类 / 说明全部派生自 lib/panels.ts（与左侧导航同步） -->
    <PageHead panel="search" class="lg:shrink-0" />

    <div :class="CARD + ' flex flex-col overflow-hidden'">
      <CardHead title="引擎列表" :count="engines.length + ' 个'">
        <button type="button" :class="BTN_PRIMARY + ' shrink-0'" @click="openAdd">
          <AdminIcon name="plus" :size="13" />添加引擎
        </button>
      </CardHead>

      <!-- 表格（lg 起占满剩余高度、卡内独立滚动）；与「链接列表」同款表样式 -->
      <div class="overflow-x-auto lg:min-h-0 lg:flex-1 lg:overflow-auto">
        <table :class="TABLE + ' min-w-[640px] text-center'">
          <thead :class="THEAD">
            <tr>
              <th :class="thCls + ' w-10'"></th>
              <th :class="thCls + ' w-12'">图标</th>
              <th :class="thCls">名称</th>
              <th :class="thCls">网址</th>
              <th :class="thCls + ' w-24'">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(e, i) in engines"
              :key="e.id"
              :class="[ROW, { 'opacity-50': dragId === e.id, 'ring-2 ring-accent ring-inset': dragOverId === e.id }]"
              :data-drag-id="e.id"
              @dragover="onDragOver(e.id, $event)"
              @dragleave="onDragLeave(e.id)"
              @drop="onDrop(e.id, $event)"
            >
              <td
                :class="tdCls + ' w-10 touch-none cursor-grab select-none text-center text-slate-300 active:cursor-grabbing'"
                title="拖拽排序"
                draggable="true"
                @dragstart="onDragStart(e.id, $event)"
                @pointerdown="touch.onTouchDown(e.id, $event)"
                @pointermove="touch.onTouchMove"
                @pointerup="touch.onTouchUp"
                @pointercancel="touch.onTouchCancel"
              >⠿</td>
              <td :class="tdCls">
                <img
                  :src="iconOf(e)"
                  width="20"
                  height="20"
                  alt=""
                  class="h-5 w-5 rounded-md object-cover"
                  @error="markIconFail(e.id)"
                />
              </td>
              <td :class="tdCls">
                <input
                  :value="e.name"
                  type="text"
                  placeholder="名称"
                  :class="INPUT_BASE + ' w-full'"
                  @input="setEngineName(i, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td :class="tdCls + ' max-w-[260px]'">
                <input
                  :value="e.url"
                  type="text"
                  placeholder="https://…/search?q="
                  :class="INPUT_BASE + ' w-full'"
                  @input="setEngineUrl(i, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td :class="tdCls + ' whitespace-nowrap'">
                <button type="button" :class="LINK_DANGER" @click="removeEngine(e.id)">删除</button>
              </td>
            </tr>
            <tr v-if="!engines.length">
              <td :class="tdCls + ' text-center text-slate-400'" colspan="5">未配置（站外搜索将不可用）</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 添加搜索引擎（弹窗，与「添加链接」同款） -->
    <Modal v-if="addOpen" title="添加搜索引擎" @close="addOpen = false">
      <div class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">名称</span>
          <input v-model="form.name" type="text" placeholder="例如：Google" :class="inputCls" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">搜索网址</span>
          <input
            v-model="form.url"
            type="text"
            placeholder="https://www.google.com/search?q="
            :class="inputCls"
            @keyup.enter="submitAdd"
          />
        </label>
        <p class="text-xs text-slate-400">
          关键词会直接拼在网址末尾，请以搜索引擎的 <span class="font-mono">?q=</span> 收尾。
        </p>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">图标（可选）</span>
          <div class="flex items-center gap-2">
            <img
              :src="formIconPreview"
              width="24"
              height="24"
              alt=""
              class="h-6 w-6 shrink-0 rounded-md object-cover"
            />
            <input
              v-model="form.icon"
              type="text"
              placeholder="留空则按网址自动抓取站点图标"
              :class="inputCls"
              @keyup.enter="submitAdd"
            />
          </div>
        </label>
        <p v-if="formError" class="text-xs text-red-500">{{ formError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" :class="BTN_SECONDARY" @click="addOpen = false">取消</button>
          <button type="button" :class="BTN_PRIMARY" @click="submitAdd">保存</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
