<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from './components/AppIcon.vue';
import CategorySection from './components/CategorySection.vue';
import ContextMenu from './components/ContextMenu.vue';
import PinnedSection from './components/PinnedSection.vue';
import ShareModal from './components/ShareModal.vue';
import SidebarNav from './components/SidebarNav.vue';
import Toast from './components/Toast.vue';
import TopBar from './components/TopBar.vue';
import { GRID } from './lib/ui';
import {
  ALL,
  bootstrap,
  categories,
  counts,
  hasData,
  noResults,
  openLink,
  pinnedList,
  sections,
  setActiveCat,
  setDrawer,
  state,
  totalCount,
  type IndexedLink,
} from './stores/nav';

const contentRef = ref<HTMLElement | null>(null);

const menu = ref<{ link: IndexedLink; x: number; y: number } | null>(null);
const share = ref<IndexedLink | null>(null);
const toast = ref('');
/** 「全部链接」视图下滚动联动高亮的分类 */
const spyCat = ref<string>(ALL);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let observer: IntersectionObserver | null = null;

const gridClass = computed(() => GRID[state.cardStyle]);
/** 侧栏高亮项：全部链接视图跟随滚动，单分类视图即选中项 */
const sidebarActive = computed(() => (state.activeCat === ALL ? spyCat.value : state.activeCat));

function showToast(msg: string): void {
  toast.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 1800);
}

// ───────────────── 右键菜单 / 分享 / 复制 ─────────────────

function onContext(payload: { link: IndexedLink; x: number; y: number }): void {
  menu.value = payload;
}

async function copyLink(link: IndexedLink): Promise<void> {
  menu.value = null;
  let ok = false;
  try {
    await navigator.clipboard.writeText(link.url);
    ok = true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = link.url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
  }
  showToast(ok ? '链接已复制' : '复制失败，请手动复制');
}

function openFromMenu(link: IndexedLink): void {
  menu.value = null;
  openLink(link.url);
}

function shareLink(link: IndexedLink): void {
  menu.value = null;
  share.value = link;
}

// ───────────────── 分类切换 ─────────────────

function revealSection(catId: string): void {
  const root = contentRef.value;
  if (!root) return;
  const el = root.querySelector<HTMLElement>(`#cat-${catId}`);
  if (!el) return;
  // content-visibility: auto 会让未渲染的 section 只有估值高度 → 先强制渲染再定位/滚动，避免落点不准
  el.classList.add('force-render');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('force-render')));
}

function selectCat(id: string): void {
  setActiveCat(id);
  nextTick(() => {
    const root = contentRef.value;
    if (!root) return;
    if (id !== ALL) revealSection(id);
    root.scrollTo({ top: 0 });
    if (id === ALL) setupObserver();
  });
}

// ───────────────── 滚动联动高亮（仅「全部链接」视图） ─────────────────

function setupObserver(): void {
  observer?.disconnect();
  observer = null;
  const root = contentRef.value;
  if (!root || state.activeCat !== ALL || state.appliedQuery) {
    spyCat.value = ALL;
    return;
  }
  const nodes = root.querySelectorAll<HTMLElement>('.cat-section');
  if (!nodes.length) return;

  const visible = new Map<string, number>();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.cat;
        if (!id) continue;
        if (entry.isIntersecting) visible.set(id, entry.boundingClientRect.top);
        else visible.delete(id);
      }
      let best: string | null = null;
      let bestTop = Number.POSITIVE_INFINITY;
      for (const [id, top] of visible) {
        if (top < bestTop) {
          bestTop = top;
          best = id;
        }
      }
      // 顶部（置顶区）没有 section 命中窄带时，回到「全部链接」
      spyCat.value = best ?? ALL;
    },
    { root, rootMargin: '0px 0px -70% 0px', threshold: 0 },
  );
  nodes.forEach((n) => observer?.observe(n));
}

watch(sections, () => nextTick(setupObserver));

onMounted(() => {
  bootstrap();
  nextTick(setupObserver);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<template>
  <div class="app-shell">
    <!-- 背景层：渐变 + 两个漂移光斑（对齐 nav.lts.cc，纯 CSS 装饰） -->
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gray-100 dark:bg-[#0f172a]">
      <div class="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-[#0f172a] dark:to-[#1e293b]"></div>
      <div
        class="animate-blob absolute left-[-10%] top-[-10%] h-[800px] w-[800px] rounded-full bg-emerald-200/30 blur-[150px] mix-blend-multiply dark:bg-indigo-900/20 dark:mix-blend-screen"
      ></div>
      <div
        class="animate-blob-slow absolute bottom-[-15%] right-[-10%] h-[700px] w-[700px] rounded-full bg-teal-200/30 blur-[150px] mix-blend-multiply dark:bg-emerald-900/20 dark:mix-blend-screen"
      ></div>
    </div>

    <SidebarNav
      :class="{ 'is-open': state.drawerOpen }"
      :settings="state.settings"
      :categories="categories"
      :counts="counts"
      :total-count="totalCount"
      :active-cat="sidebarActive"
      @select="selectCat"
      @close="setDrawer(false)"
    />

    <!-- 移动端抽屉遮罩 -->
    <div
      v-if="state.drawerOpen"
      class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
      @click="setDrawer(false)"
    />

    <div class="flex min-w-0 flex-col overflow-hidden">
      <TopBar />

      <!-- 读失败降级提示：不弹窗、不阻断浏览 -->
      <div
        v-if="state.stale"
        class="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 lg:px-8 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
      >
        <AppIcon name="alert" :size="14" />
        <span>数据可能不是最新</span>
      </div>

      <main ref="contentRef" class="hn-scroll min-h-0 flex-1 p-4 lg:p-8">
        <div class="mx-auto w-full max-w-[1600px] space-y-8">
          <!-- 全局置顶区：两个视图都显示，内容都是跨分类的全部置顶链接 -->
          <PinnedSection
            v-if="pinnedList.length"
            :links="pinnedList"
            :card-style="state.cardStyle"
            :icon-strategy="state.settings.iconStrategy"
            :open-in-new-tab="state.settings.openInNewTab"
            :grid-class="gridClass"
            @context="onContext"
          />

          <CategorySection
            v-for="s in sections"
            :key="s.cat.id"
            :section="s"
            :card-style="state.cardStyle"
            :icon-strategy="state.settings.iconStrategy"
            :open-in-new-tab="state.settings.openInNewTab"
            :grid-class="gridClass"
            @context="onContext"
          />

          <!-- 空态 -->
          <div
            v-if="!hasData && !state.appliedQuery"
            class="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-20 text-center dark:border-slate-700 dark:bg-slate-800/50"
          >
            <AppIcon name="grid" :size="28" class="text-slate-300 dark:text-slate-600" />
            <p class="text-sm text-slate-400">{{ state.stale ? '数据加载失败' : '还没有内容' }}</p>
            <p class="text-xs text-slate-400 dark:text-slate-500">
              {{ state.stale ? '请检查网络后刷新重试' : '打开 /admin 导入浏览器书签或手动添加' }}
            </p>
          </div>
          <div v-else-if="noResults" class="flex flex-col items-center justify-center gap-2 py-20 text-center">
            <AppIcon name="search" :size="26" class="text-slate-300 dark:text-slate-600" />
            <p class="text-sm text-slate-400">没有匹配的链接</p>
          </div>
        </div>
      </main>
    </div>

    <!-- 浮层按需挂载（v-if），不常驻 DOM -->
    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :link="menu.link"
      :open-in-new-tab="state.settings.openInNewTab"
      @copy="copyLink(menu!.link)"
      @share="shareLink(menu!.link)"
      @open="openFromMenu(menu!.link)"
      @close="menu = null"
    />

    <ShareModal v-if="share" :link="share" @close="share = null" />

    <Toast v-if="toast" :message="toast" />
  </div>
</template>
