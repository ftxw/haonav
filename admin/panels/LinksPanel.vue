<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Modal from '../components/Modal.vue';
import { between, appendOrder, orderForIndex } from '../lib/order';
import { newId, hostOf, maxOrderOf } from '../lib/util';
import { linkLetterIcon } from '../../web/lib/brandIcon';
import { commit, state, toast } from '../lib/adminStore';
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  INPUT,
  LINK_BTN,
  LINK_DANGER,
  PAGE,
  PAGE_HEAD,
  PAGE_HEAD_MAIN,
  PAGE_TITLE,
  ROW,
  SECTION_LABEL,
  TABLE,
  TABLE_WRAP,
  TD,
  TH,
  THEAD,
} from '../lib/adminUi';
import type { Category, LinkItem } from '../../shared/types';

/* ───────── 筛选 ───────── */
const fCat = ref<string>('all'); // all | none | <catId>
const fQuery = ref('');
const fPinned = ref<'all' | 'pinned' | 'unpinned'>('all');
const fDesc = ref<'all' | 'with' | 'without'>('all');

const catName = computed<Record<string, string>>(() => {
  const m: Record<string, string> = { '': '（未分类）' };
  for (const c of state.doc?.categories ?? []) m[c.id] = c.name;
  return m;
});

/**
 * 列表里的图标，优先级与前台 `web/components/LinkCard.vue` **完全一致**（所见即所得）：
 *  - `letter` 策略语义是「零请求」→ 只用本地字母图标，刻意忽略自定义 URL；
 *  - `fetched`：自定义 http(s) 图标 → 直连 api.xinac.net 自动抓取 → 字母兜底。
 */
function iconSrc(l: LinkItem): string {
  const letter = linkLetterIcon(l.title, l.url);
  if (state.doc?.settings?.iconStrategy !== 'fetched') return letter;
  const custom = l.icon && /^https?:\/\//i.test(l.icon) ? l.icon : '';
  const auto = l.url ? 'https://api.xinac.net/icon/?url=' + encodeURIComponent(l.url) : '';
  return custom || auto || letter;
}

/** 图标加载失败（域名未登记 / 抓取失败）→ 回退字母图标，避免列表里出现破图 */
function onIconError(e: Event): void {
  const el = e.target as HTMLImageElement | null;
  if (!el) return;
  const id = el.dataset.linkId;
  const l = id ? state.doc?.links.find((x) => x.id === id) : undefined;
  el.src = l ? linkLetterIcon(l.title, l.url) : '';
}

const rows = computed<(LinkItem & { host: string })[]>(() => {
  const d = state.doc;
  if (!d) return [];
  const catOrder = new Map<string, string>(d.categories.map((c) => [c.id, c.order]));
  const q = fQuery.value.trim().toLowerCase();
  const list = d.links.filter((l) => {
    if (fCat.value === 'none' ? l.cat !== '' : fCat.value !== 'all' && l.cat !== fCat.value) return false;
    if (fPinned.value === 'pinned' && !l.pinned) return false;
    if (fPinned.value === 'unpinned' && l.pinned) return false;
    if (fDesc.value === 'with' && !l.desc) return false;
    if (fDesc.value === 'without' && l.desc) return false;
    if (q && !(l.title.toLowerCase().includes(q) || l.url.toLowerCase().includes(q))) return false;
    return true;
  });
  list.sort((a, b) => {
    const ca = catOrder.get(a.cat) ?? '\uffff';
    const cb = catOrder.get(b.cat) ?? '\uffff';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
  });
  return list.map((l) => ({ ...l, host: hostOf(l.url) }));
});

/* ───────── 多选 ───────── */
const selected = ref<Set<string>>(new Set());
const allChecked = computed(() => rows.value.length > 0 && rows.value.every((r) => selected.value.has(r.id)));

function toggleAll(): void {
  if (allChecked.value) selected.value = new Set();
  else selected.value = new Set(rows.value.map((r) => r.id));
}
function toggle(id: string): void {
  const s = new Set(selected.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  selected.value = s;
}
function clearSel(): void {
  selected.value = new Set();
}

const batchCat = ref<string>('');
const applyBatchCat = (): void => {
  const ids = selected.value;
  if (!ids.size || !batchCat.value) return;
  const target = batchCat.value === '__none__' ? '' : batchCat.value;
  commit((d) => {
    // 追加到目标分类末尾，避免与现有 order 冲突
    let last = maxOrderOf(d.links.filter((l) => l.cat === target).map((l) => l.order));
    for (const l of d.links) {
      if (!ids.has(l.id) || l.cat === target) continue;
      last = appendOrder(last);
      l.cat = target;
      l.order = last;
    }
  });
  toast(`已移动 ${ids.size} 条`);
  clearSel();
};

const batchPin = (pinned: boolean): void => {
  const ids = selected.value;
  if (!ids.size) return;
  commit((d) => {
    for (const l of d.links) if (ids.has(l.id)) l.pinned = pinned || undefined;
  });
  toast(pinned ? `已置顶 ${ids.size} 条` : `已取消置顶 ${ids.size} 条`);
  clearSel();
};

const batchDelete = (): void => {
  const ids = selected.value;
  if (!ids.size) return;
  if (!window.confirm(`确定删除选中的 ${ids.size} 条链接？删除将立即保存。`)) return;
  commit((d) => {
    d.links = d.links.filter((l) => !ids.has(l.id));
  });
  toast(`已删除 ${ids.size} 条`);
  clearSel();
};

/* ───────── 拖拽排序（只写被拖动那一条；插不进时该分类整体重排） ───────── */
const dragId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);

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
  moveLink(id, targetId);
}

function moveLink(id: string, targetId: string): void {
  const list = rows.value;
  const from = list.findIndex((r) => r.id === id);
  const to = list.findIndex((r) => r.id === targetId);
  if (from < 0 || to < 0) return;
  const targetCat = list[to].cat;

  const ordered = list.slice();
  const [moved] = ordered.splice(from, 1);
  const tIndex = ordered.findIndex((r) => r.id === targetId);
  ordered.splice(from < to ? tIndex + 1 : tIndex, 0, moved);

  const idx = ordered.findIndex((r) => r.id === id);
  const prevEl = ordered[idx - 1];
  const nextEl = ordered[idx + 1];
  const prev = prevEl && prevEl.cat === targetCat ? prevEl.order : null;
  const next = nextEl && nextEl.cat === targetCat ? nextEl.order : null;
  const newOrder = between(prev, next);

  commit((d) => {
    const l = d.links.find((x) => x.id === id);
    if (!l) return;
    l.cat = targetCat;
    l.order = newOrder;
    // base-62 中点耗尽的极端情况：该分类内整体重排（仍是 1 次 KV 写）
    if ((prev && l.order <= prev) || (next && l.order >= next)) reflowCategory(d, targetCat);
  });
}

function reflowCategory(d: import('../../shared/types').Doc, catId: string): void {
  const bucket = d.links.filter((l) => l.cat === catId).sort((a, b) => (a.order < b.order ? -1 : 1));
  bucket.forEach((l, i) => (l.order = orderForIndex(i)));
}

/* ───────── 新增 / 编辑 ───────── */
const editing = ref<LinkItem | null>(null);
const isAdd = ref(false);
const form = ref({ title: '', url: '', desc: '', icon: '', cat: '', pinned: false });
const formError = ref('');

/** 图标预览：只接受 http(s)；加载失败则隐藏图片并提示 */
const iconPreviewFailed = ref(false);
const iconPreview = computed(() => {
  const v = form.value.icon.trim();
  return /^https?:\/\//i.test(v) && !iconPreviewFailed.value ? v : '';
});
watch(
  () => form.value.icon,
  () => {
    iconPreviewFailed.value = false;
  },
);

function openAdd(): void {
  isAdd.value = true;
  // categories 可能为 undefined（旧/残破文档），可选链要一路护住到下标访问
  form.value = { title: '', url: '', desc: '', icon: '', cat: state.doc?.categories?.[0]?.id ?? '', pinned: false };
  formError.value = '';
  iconPreviewFailed.value = false;
  editing.value = {} as LinkItem;
}
function openEdit(l: LinkItem): void {
  isAdd.value = false;
  form.value = { title: l.title, url: l.url, desc: l.desc ?? '', icon: l.icon ?? '', cat: l.cat, pinned: !!l.pinned };
  formError.value = '';
  iconPreviewFailed.value = false;
  editing.value = l;
}
function closeForm(): void {
  editing.value = null;
}

function submitForm(): void {
  const f = form.value;
  const url = f.url.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    formError.value = '请填写以 http:// 或 https:// 开头的网址';
    return;
  }
  if (!f.title.trim()) {
    formError.value = '请填写标题';
    return;
  }
  // 只接受 http(s) 的自定义图标，其余（含留空）一律 undefined → 交给 iconStrategy 决定
  const icon = /^https?:\/\//i.test(f.icon.trim()) ? f.icon.trim() : undefined;
  if (isAdd.value) {
    commit((d) => {
      const last = maxOrderOf(d.links.filter((l) => l.cat === f.cat).map((l) => l.order));
      d.links.push({
        id: newId(),
        title: f.title.trim(),
        url,
        // 交给服务端 normalizeUrl（hydrateLink 只在 urlKey 为空时计算）：
        // 前端若塞原始 url 会让去重失效（'https://a.com/' 与 'https://a.com' 判为不同）
        urlKey: '',
        desc: f.desc.trim() || undefined,
        cat: f.cat,
        order: appendOrder(last),
        pinned: f.pinned || undefined,
        icon,
        createdAt: Date.now(),
      });
    });
    toast('已添加');
  } else if (editing.value) {
    const id = editing.value.id;
    commit((d) => {
      const l = d.links.find((x) => x.id === id);
      if (!l) return;
      l.title = f.title.trim();
      l.url = url;
      l.desc = f.desc.trim() || undefined;
      l.icon = icon;
      if (l.cat !== f.cat) {
        const last = maxOrderOf(d.links.filter((x) => x.id !== id && x.cat === f.cat).map((x) => x.order));
        l.cat = f.cat;
        l.order = appendOrder(last);
      }
      l.pinned = f.pinned || undefined;
    });
    toast('已修改');
  }
  closeForm();
}

function removeOne(l: LinkItem): void {
  if (!window.confirm(`删除「${l.title}」？`)) return;
  commit((d) => {
    d.links = d.links.filter((x) => x.id !== l.id);
  });
  toast('已删除');
}

/* 类名统一走 admin/lib/adminUi.ts（玻璃面 + accent 令牌，与前台同语言） */
const inputCls = INPUT;
const thCls = TH;
const tdCls = TD;
</script>

<template>
  <div :class="PAGE">
    <!-- 页面标题区：微标签 + 大标题 + 右侧主操作 -->
    <div :class="PAGE_HEAD">
      <div :class="PAGE_HEAD_MAIN">
        <span :class="SECTION_LABEL">链接管理</span>
        <h2 :class="PAGE_TITLE">链接</h2>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" :class="BTN_PRIMARY" @click="openAdd">＋ 添加链接</button>
      </div>
    </div>

    <!-- 筛选栏（玻璃卡片） -->
    <div class="flex flex-wrap items-center gap-2 p-4" :class="CARD">
      <select v-model="fCat" :class="inputCls + ' w-44'">
        <option value="all">全部分类</option>
        <option value="none">（未分类）</option>
        <option v-for="c in state.doc?.categories ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <input v-model="fQuery" type="search" placeholder="搜标题 / 网址" :class="inputCls + ' w-52'" />
      <select v-model="fPinned" :class="inputCls + ' w-32'">
        <option value="all">置顶：全部</option>
        <option value="pinned">仅置顶</option>
        <option value="unpinned">仅未置顶</option>
      </select>
      <select v-model="fDesc" :class="inputCls + ' w-36'">
        <option value="all">描述：全部</option>
        <option value="with">有描述</option>
        <option value="without">无描述</option>
      </select>
      <span class="ml-auto text-xs text-slate-500">{{ rows.length }} 条</span>
    </div>

    <!-- 批量操作栏 -->
    <div
      v-if="selected.size"
      class="flex flex-wrap items-center gap-2 px-3 py-2 ring-1 ring-accent/30"
      :class="CARD"
    >
      <span class="text-xs font-medium text-accent">已选 {{ selected.size }} 条</span>
      <select v-model="batchCat" :class="inputCls + ' w-40 !py-1.5'">
        <option value="" disabled>移动到分类…</option>
        <option value="__none__">（未分类）</option>
        <option v-for="c in state.doc?.categories ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <button type="button" :class="BTN_PRIMARY" :disabled="!batchCat" @click="applyBatchCat">应用</button>
      <button type="button" :class="BTN_SECONDARY" @click="batchPin(true)">置顶</button>
      <button type="button" :class="BTN_SECONDARY" @click="batchPin(false)">取消置顶</button>
      <button type="button" :class="BTN_DANGER" @click="batchDelete">删除</button>
      <button type="button" class="ml-auto text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300" @click="clearSel">取消选择</button>
    </div>

    <!-- 表格 -->
    <div class="overflow-x-auto" :class="TABLE_WRAP">
      <table class="min-w-[720px]" :class="TABLE">
        <thead :class="THEAD">
          <tr>
            <th :class="thCls + ' w-10'">
              <input type="checkbox" :checked="allChecked" @change="toggleAll" aria-label="全选" />
            </th>
            <th :class="thCls + ' w-8'"></th>
            <th :class="thCls + ' w-12'">图标</th>
            <th :class="thCls">标题</th>
            <th :class="thCls">网址</th>
            <th :class="thCls + ' w-32'">分类</th>
            <th :class="thCls + ' w-16'">置顶</th>
            <th :class="thCls + ' w-24'">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.id"
            :class="[ROW, { 'opacity-50': dragId === r.id, 'ring-2 ring-accent ring-inset': dragOverId === r.id }]"
            draggable="true"
            @dragstart="onDragStart(r.id, $event)"
            @dragover="onDragOver(r.id, $event)"
            @dragleave="onDragLeave(r.id)"
            @drop="onDrop(r.id, $event)"
          >
            <td :class="tdCls"><input type="checkbox" :checked="selected.has(r.id)" @change="toggle(r.id)" :aria-label="'选中 ' + r.title" /></td>
            <td :class="tdCls + ' cursor-grab text-slate-300 active:cursor-grabbing'" title="拖拽排序">⠿</td>
            <td :class="tdCls">
              <img
                :src="iconSrc(r)"
                :data-link-id="r.id"
                alt=""
                loading="lazy"
                class="h-5 w-5 rounded object-contain"
                @error="onIconError($event)"
              />
            </td>
            <td :class="tdCls">
              <span class="font-medium">{{ r.title }}</span>
              <span v-if="r.desc" class="block text-xs text-slate-400">{{ r.desc }}</span>
            </td>
            <td :class="tdCls + ' max-w-[220px]'"><span class="block truncate text-xs text-slate-500">{{ r.url }}</span></td>
            <td :class="tdCls + ' text-xs'">{{ catName[r.cat] || r.cat || '（未分类）' }}</td>
            <td :class="tdCls">
              <button type="button" :aria-label="r.pinned ? '取消置顶' : '置顶'" @click="commit((d) => { const x = d.links.find((y) => y.id === r.id); if (x) x.pinned = r.pinned ? undefined : true; })">
                <span :class="r.pinned ? 'text-amber-500' : 'text-slate-300 hover:text-slate-500'">★</span>
              </button>
            </td>
            <td :class="tdCls + ' whitespace-nowrap'">
              <button type="button" :class="LINK_BTN" @click="openEdit(r)">编辑</button>
              <button type="button" class="ml-2" :class="LINK_DANGER" @click="removeOne(r)">删除</button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :class="tdCls + ' text-center text-slate-400'" colspan="8">没有符合筛选条件的链接</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Modal v-if="editing" :title="isAdd ? '添加链接' : '编辑链接'" @close="closeForm">
      <div class="space-y-3">
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">网址</span>
          <input v-model="form.url" type="url" placeholder="https://" :class="inputCls" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">标题</span>
          <input v-model="form.title" type="text" :class="inputCls" />
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">图标 URL（可选）</span>
          <div class="flex items-center gap-2">
            <input v-model="form.icon" type="url" placeholder="留空自动获取" :class="inputCls + ' min-w-0 flex-1'" />
            <img
              v-if="iconPreview"
              :src="iconPreview"
              width="28"
              height="28"
              alt=""
              class="h-7 w-7 shrink-0 rounded-md border border-slate-200 object-contain dark:border-slate-700"
              @error="iconPreviewFailed = true"
            />
          </div>
          <span v-if="iconPreviewFailed" class="mt-1 block text-xs text-slate-400">无法加载该图片</span>
          <span class="mt-1 block text-xs text-slate-400">仅「抓取站点图标」模式下生效；留空则自动抓取该站点图标</span>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">描述（可选）</span>
          <textarea v-model="form.desc" rows="2" :class="inputCls"></textarea>
        </label>
        <div class="flex items-center gap-3">
          <label class="block flex-1">
            <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">分类</span>
            <select v-model="form.cat" :class="inputCls">
              <option value="">（未分类）</option>
              <option v-for="c in state.doc?.categories ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label class="mt-5 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input v-model="form.pinned" type="checkbox" /> 置顶
          </label>
        </div>
        <p v-if="formError" class="text-xs text-red-500">{{ formError }}</p>
        <div class="flex justify-end gap-2 pt-1">
          <button type="button" :class="BTN_SECONDARY" @click="closeForm">取消</button>
          <button type="button" :class="BTN_PRIMARY" @click="submitForm">保存</button>
        </div>
      </div>
    </Modal>
  </div>
</template>
