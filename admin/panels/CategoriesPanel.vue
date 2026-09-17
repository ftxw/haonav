<script setup lang="ts">
import { computed, ref } from 'vue';
import Modal from '../components/Modal.vue';
import AdminIcon from '../components/AdminIcon.vue';
import CardHead from '../components/CardHead.vue';
import PageHead from '../components/PageHead.vue';
import { between, appendOrder, orderForIndex } from '../lib/order';
import { newId, maxOrderOf, slugId } from '../lib/util';
import { dragIdAt, useTouchDrag } from '../lib/useTouchDrag';
import { commit, state, toast } from '../lib/adminStore';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  INPUT,
  LINK_BTN,
  LINK_DANGER,
  PAGE,
  ROW,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  THEAD,
} from '../lib/adminUi';
import type { Category } from '../../shared/types';

const counts = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {};
  for (const l of state.doc?.links ?? []) m[l.cat] = (m[l.cat] ?? 0) + 1;
  return m;
});

const cats = computed<Category[]>(() =>
  [...(state.doc?.categories ?? [])].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0)),
);

/* ───────── 新增 / 编辑 ───────── */
/* 分类可选线性图标（与 web/components/AppIcon.vue 的 icon 型分类图标同表） */
const ICON_CHOICES = [
  'folder',
  'star',
  'globe',
  'code',
  'book',
  'gamepad',
  'palette',
  'rss',
  'music',
  'video',
  'image',
  'chat',
  'mail',
  'cart',
  'map',
  'cloud',
] as const;

const editing = ref<Category | null>(null);
const isAdd = ref(false);
const form = ref({ name: '', icon: 'folder' });
const formError = ref('');

function openAdd(): void {
  isAdd.value = true;
  form.value = { name: '', icon: 'folder' };
  formError.value = '';
  editing.value = {} as Category;
}
function openEdit(c: Category): void {
  isAdd.value = false;
  form.value = { name: c.name, icon: c.icon };
  formError.value = '';
  editing.value = c;
}
function closeForm(): void {
  editing.value = null;
}

function submitForm(): void {
  const name = form.value.name.trim();
  if (!name) {
    formError.value = '请填写分类名称';
    return;
  }
  const icon = form.value.icon || 'folder';

  if (isAdd.value) {
    commit((d) => {
      d.categories.push({ id: newId(), name, icon, order: appendOrder(maxOrderOf(d.categories.map((c) => c.order))) });
    });
    toast('分类已添加');
  } else if (editing.value) {
    const id = editing.value.id;
    commit((d) => {
      const c = d.categories.find((x) => x.id === id);
      if (c) {
        c.name = name;
        c.icon = icon;
      }
    });
    toast('分类已修改');
  }
  closeForm();
}

/* ───────── 拖拽排序 ─────────
   鼠标：原生 HTML5 DnD；触屏：拖拽柄上的指针手势（见 useTouchDrag），避免与原生滚动打架。
   两种落点共用 `moveCat`，落库语义完全一致（仍只写被移动那一条，插不进时整体重排）。 */
const touch = useTouchDrag({ onDrop: (from, to) => moveCat(from, to), resolveId: dragIdAt });
const dragId = touch.dragId;
const dragOverId = touch.overId;

function moveCat(id: string, targetId: string): void {
  if (!id || id === targetId) return;

  const list = cats.value.slice();
  const from = list.findIndex((c) => c.id === id);
  const to = list.findIndex((c) => c.id === targetId);
  if (from < 0 || to < 0) return;
  const [moved] = list.splice(from, 1);
  const tIndex = list.findIndex((c) => c.id === targetId);
  list.splice(from < to ? tIndex + 1 : tIndex, 0, moved);

  const idx = list.findIndex((c) => c.id === id);
  const prev = list[idx - 1]?.order ?? null;
  const next = list[idx + 1]?.order ?? null;
  const newOrder = between(prev, next);

  commit((d) => {
    const c = d.categories.find((x) => x.id === id);
    if (!c) return;
    c.order = newOrder;
    if ((prev && c.order <= prev) || (next && c.order >= next)) {
      const sorted = d.categories
        .filter((x) => x.id !== id)
        .sort((a, b) => (a.order < b.order ? -1 : 1));
      // 重排后重算被移动项的落点
      const all = [...sorted];
      all.splice(Math.min(idx, all.length), 0, c);
      all.forEach((x, i) => (x.order = orderForIndex(i)));
    }
  });
}

function onDrop(targetId: string, e: DragEvent): void {
  e.preventDefault();
  const id = dragId.value;
  dragId.value = null;
  dragOverId.value = null;
  if (!id) return;
  moveCat(id, targetId);
}

/* ───────── 删除（链接不丢，移到指定分类） ───────── */
const deleting = ref<Category | null>(null);
const deleteTarget = ref<string>('__none__');

function openDelete(c: Category): void {
  deleting.value = c;
  deleteTarget.value = '__none__';
}
function confirmDelete(): void {
  const c = deleting.value;
  if (!c) return;
  const target = deleteTarget.value === '__none__' ? '' : deleteTarget.value;
  commit((d) => {
    // 先移链接（否则服务端 cat.delete 会把链接置为 ''，本地会失同步）
    for (const l of d.links) if (l.cat === c.id) l.cat = target;
    d.categories = d.categories.filter((x) => x.id !== c.id);
  });
  toast(`已删除「${c.name}」`);
  deleting.value = null;
}

/* ───────── 合并两个分类 ───────── */
const merging = ref(false);
const mergeFrom = ref<string>('');
const mergeTo = ref<string>('');

function confirmMerge(): void {
  const from = mergeFrom.value;
  const to = mergeTo.value;
  if (!from || !to || from === to) return;
  const fromName = cats.value.find((c) => c.id === from)?.name ?? '';
  commit((d) => {
    let last = maxOrderOf(d.links.filter((l) => l.cat === to).map((l) => l.order));
    for (const l of d.links) {
      if (l.cat !== from) continue;
      last = appendOrder(last);
      l.cat = to;
      l.order = last;
    }
    d.categories = d.categories.filter((c) => c.id !== from);
  });
  toast(`已把「${fromName}」并入「${cats.value.find((c) => c.id === to)?.name ?? ''}」`);
  merging.value = false;
  mergeFrom.value = '';
  mergeTo.value = '';
}

/* 类名统一走 admin/lib/adminUi.ts（玻璃面 + accent 令牌，与前台同语言） */
const inputCls = INPUT;
</script>

<template>
  <div :class="PAGE">
    <!-- 页面标题卡：一级分类 / 二级分类 / 说明全部派生自 lib/panels.ts（与左侧导航同步） -->
    <PageHead panel="categories" />

    <div :class="TABLE_WRAP">
      <!-- 卡片标题行：分类目录 + 计数 + 「合并分类 / ＋新建分类」右对齐（与「链接列表」同款） -->
      <CardHead title="分类目录" :count="cats.length + ' 个'">
        <button type="button" :class="BTN_SECONDARY + ' shrink-0'" @click="merging = true">
          <AdminIcon name="merge" :size="13" />合并分类
        </button>
        <button type="button" :class="BTN_PRIMARY + ' shrink-0'" @click="openAdd">
          <AdminIcon name="plus" :size="13" />新建分类
        </button>
      </CardHead>
      <table :class="TABLE + ' text-center'">
        <thead :class="THEAD">
          <tr>
            <th class="w-8" :class="TH"></th>
            <th class="w-10" :class="TH">图标</th>
            <th :class="TH">名称</th>
            <th class="w-20" :class="TH">链接数</th>
            <th class="w-28" :class="TH">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in cats"
            :key="c.id"
            :class="[ROW, { 'opacity-50': dragId === c.id, 'ring-2 ring-accent ring-inset': dragOverId === c.id }]"
            :data-drag-id="c.id"
            draggable="true"
            @dragstart="dragId = c.id"
            @dragover.prevent="dragOverId = c.id"
            @dragleave="dragOverId === c.id && (dragOverId = null)"
            @drop="onDrop(c.id, $event)"
          >
            <td
              class="touch-none cursor-grab px-3 py-2 text-slate-300 active:cursor-grabbing"
              title="拖拽排序"
              @pointerdown="touch.onTouchDown(c.id, $event)"
              @pointermove="touch.onTouchMove"
              @pointerup="touch.onTouchUp"
              @pointercancel="touch.onTouchCancel"
            >⠿</td>
            <td :class="TD">
              <span class="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 dark:text-slate-300"
                ><AdminIcon :name="c.icon" :size="16" /></span
              >
            </td>
            <td class="font-medium" :class="TD">{{ c.name }}</td>
            <td :class="TD">{{ counts[c.id] ?? 0 }}</td>
            <td class="whitespace-nowrap" :class="TD">
              <button type="button" :class="LINK_BTN" @click="openEdit(c)">编辑</button>
              <button type="button" class="ml-2" :class="LINK_DANGER" @click="openDelete(c)">删除</button>
            </td>
          </tr>
          <tr v-if="!cats.length">
            <td class="px-4 py-6 text-center text-sm text-slate-400" colspan="5">还没有分类，点右上角新建</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新建 / 编辑 -->
    <Modal v-if="editing" :title="isAdd ? '新建分类' : '编辑分类'" @close="closeForm">
      <div class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">名称</span>
          <input v-model="form.name" type="text" :class="inputCls" />
        </label>
        <div class="space-y-2">
          <span class="block text-xs font-medium text-slate-600 dark:text-slate-300">图标</span>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="n in ICON_CHOICES"
              :key="n"
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
              :class="
                form.icon === n
                  ? 'bg-accent text-white shadow-md'
                  : 'text-slate-500 hover:bg-slate-900/[0.06] dark:text-slate-300 dark:hover:bg-white/10'
              "
              @click="form.icon = n"
            >
              <AdminIcon :name="n" :size="18" />
            </button>
          </div>
        </div>
        <p v-if="formError" class="text-xs text-red-500">{{ formError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" :class="BTN_SECONDARY" @click="closeForm">取消</button>
          <button type="button" :class="BTN_PRIMARY" @click="submitForm">保存</button>
        </div>
      </div>
    </Modal>

    <!-- 删除确认 -->
    <Modal v-if="deleting" :title="`删除分类「${deleting.name}」`" @close="deleting = null">
      <div class="space-y-3">
        <p class="text-sm text-slate-600 dark:text-slate-300">
          该分类下有 <b>{{ counts[deleting.id] ?? 0 }}</b> 条链接。链接不会被删除，请选择去向：
        </p>
        <select v-model="deleteTarget" :class="inputCls">
          <option value="__none__">未分类</option>
          <option v-for="c in cats.filter((x) => x.id !== deleting!.id)" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" :class="BTN_SECONDARY" @click="deleting = null">取消</button>
          <button type="button" :class="BTN_DANGER" @click="confirmDelete">确认删除</button>
        </div>
      </div>
    </Modal>

    <!-- 合并 -->
    <Modal v-if="merging" title="合并分类" @close="merging = false">
      <div class="space-y-3">
        <p class="text-sm text-slate-600 dark:text-slate-300">把一个分类的全部链接并入另一个分类，然后删除源分类。</p>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">源分类（将被删除）</span>
          <select v-model="mergeFrom" :class="inputCls">
            <option value="" disabled>请选择</option>
            <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.name }}（{{ counts[c.id] ?? 0 }} 条）</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">目标分类</span>
          <select v-model="mergeTo" :class="inputCls">
            <option value="" disabled>请选择</option>
            <option v-for="c in cats.filter((x) => x.id !== mergeFrom)" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" :class="BTN_SECONDARY" @click="merging = false">取消</button>
          <button type="button" :class="BTN_PRIMARY" :disabled="!mergeFrom || !mergeTo || mergeFrom === mergeTo" @click="confirmMerge">合并</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
