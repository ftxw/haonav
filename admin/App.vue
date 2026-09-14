<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AdminIcon from './components/AdminIcon.vue';
import AdminNav, { PANEL_GROUPS } from './components/AdminNav.vue';
import Modal from './components/Modal.vue';
import BackupPanel from './panels/BackupPanel.vue';
import CategoriesPanel from './panels/CategoriesPanel.vue';
import DataPanel from './panels/DataPanel.vue';
import LinksPanel from './panels/LinksPanel.vue';
import SearchPanel from './panels/SearchPanel.vue';
import SettingsPanel from './panels/SettingsPanel.vue';
import {
  boot,
  canUndo,
  conflictDiscard,
  conflictForce,
  login,
  logout,
  save,
  startAutoRefresh,
  state,
  toast,
  undo,
  type PanelId,
} from './lib/adminStore';
import { BTN_GHOST_DANGER, BTN_PRIMARY, BTN_SECONDARY } from './lib/adminUi';

const password = ref('');
const loggingIn = ref(false);
const showDiff = ref(false);
/** 移动端抽屉开关（lg 以下侧栏隐藏，靠顶栏汉堡打开） */
const navOpen = ref(false);

/** 导航分组数据源在 AdminNav.vue，这里扁平化一份用于顶栏面包屑 */
const ALL_PANELS = PANEL_GROUPS.flatMap((g) => g.items);
const currentPanel = computed(() => ALL_PANELS.find((p) => p.id === state.panel) ?? ALL_PANELS[0]);

const conflictDiff = computed(() => {
  const c = state.conflict;
  if (!c?.serverDoc || !state.doc) return null;
  const prevIds = new Set(c.serverDoc.links.map((l) => l.id));
  const nextIds = new Set(state.doc.links.map((l) => l.id));
  return {
    added: state.doc.links.filter((l) => !prevIds.has(l.id)).length,
    removed: c.serverDoc.links.filter((l) => !nextIds.has(l.id)).length,
    serverTime: c.serverDoc.updatedAt,
    serverRev: c.serverRev,
    myRev: state.doc.rev,
  };
});

async function doLogin(): Promise<void> {
  if (!password.value) return;
  loggingIn.value = true;
  await login(password.value);
  loggingIn.value = false;
  if (state.authed) password.value = '';
}

async function doSave(): Promise<void> {
  await save();
}

function onKey(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (!undo()) toast('没有可撤销的操作');
  } else if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void doSave();
  } else if (e.key === 'Escape') {
    navOpen.value = false;
  }
}

/** 选中导航项：切面板并关闭移动端抽屉（桌面端无副作用） */
function onPick(id: PanelId): void {
  state.panel = id;
  navOpen.value = false;
}

/** 有未保存改动时拦截关闭/刷新 */
function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
}

onMounted(() => {
  void boot();
  startAutoRefresh();
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>

<!-- 背景层：与前台同款渐变 + 光斑（登录页与主界面共用） -->
<template>
  <!-- 用 z-0 + 内容 z-10 的显式层叠，不用负 z-index（祖先若有不透明背景会整层盖住它；
       body 也不能有不透明背景类，否则同样会盖住这一层） -->
  <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-gray-100 dark:bg-[#0a0f1a]">
    <div class="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-[#0a0f1a] dark:to-[#0f172a]"></div>
    <div
      class="animate-blob absolute left-[-10%] top-[-10%] h-[800px] w-[800px] rounded-full bg-emerald-200/40 blur-[150px] dark:bg-emerald-500/15 dark:mix-blend-screen"
    ></div>
    <div
      class="animate-blob-slow absolute bottom-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-teal-200/30 blur-[120px] dark:bg-teal-500/12 dark:mix-blend-screen"
    ></div>
  </div>

  <!-- ═════════ 登录 ═════════ -->
  <div v-if="state.checking" class="relative z-10 flex min-h-screen items-center justify-center text-sm text-slate-400">
    正在检查登录状态…
  </div>

  <div v-else-if="!state.authed" class="relative z-10 flex min-h-screen items-center justify-center p-6">
    <form
      class="glass-surface w-full max-w-sm rounded-3xl p-8"
      @submit.prevent="doLogin"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white shadow-lg shadow-emerald-500/30 ring-1 ring-white/25"
        >
          H
        </div>
        <h1 class="text-lg font-bold text-slate-800 dark:text-slate-100">HaoNav 管理后台</h1>
      </div>
      <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">只有站长能改数据；前台浏览不需要登录。</p>
      <input
        v-model="password"
        type="password"
        placeholder="管理密码"
        autocomplete="current-password"
        class="mt-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-accent dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
      />
      <p v-if="state.error" class="mt-2 text-xs text-red-500">{{ state.error }}</p>
      <button
        type="submit"
        class="mt-4 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        :disabled="loggingIn || !password"
      >
        {{ loggingIn ? '登录中…' : '登录' }}
      </button>
    </form>
  </div>

  <!-- ═════════ 主界面：左侧固定导航 + 右侧内容区 ═════════ -->
  <div v-else class="relative z-10 flex h-screen overflow-hidden">
    <!-- 桌面侧栏（w-60 ≈ 15rem）：玻璃面，lg 以下隐藏，改为顶栏汉堡打开抽屉 -->
    <aside class="glass-surface hidden w-60 shrink-0 flex-col lg:flex">
      <AdminNav @pick="onPick" />
    </aside>

    <!-- 移动端抽屉：遮罩 + 左侧滑出面板（内容与桌面侧栏共用同一组件） -->
    <div v-if="navOpen" class="fixed inset-0 z-50 lg:hidden">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="navOpen = false"></div>
      <aside class="glass-surface absolute inset-y-0 left-0 flex w-64 flex-col">
        <button
          type="button"
          class="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-900/[0.06] dark:text-slate-300 dark:hover:bg-white/10"
          aria-label="关闭导航"
          @click="navOpen = false"
        >
          <AdminIcon name="close" :size="18" />
        </button>
        <AdminNav @pick="onPick" />
      </aside>
    </div>

    <!-- 右侧：顶栏 + 独立滚动的内容区 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="glass-surface flex h-14 shrink-0 items-center gap-3 px-4 lg:px-6">
        <!-- 汉堡：仅 lg 以下出现（窄屏不换行，故顶栏去掉 flex-wrap） -->
        <button
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-700 lg:hidden dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
          aria-label="打开导航"
          :aria-expanded="navOpen"
          @click="navOpen = true"
        >
          <AdminIcon name="menu" :size="18" />
        </button>

        <!-- 面包屑：大标题交给各面板的 PAGE_HEAD，顶栏只做上下文 + 全局保存/撤销 -->
        <span
          class="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          管理后台<span class="text-slate-300 dark:text-slate-600">/</span>{{ currentPanel.label }}
        </span>
        <span class="hidden text-xs text-slate-400 sm:inline">rev {{ state.doc?.rev ?? '—' }}</span>
        <span v-if="state.dirty" class="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>未保存
        </span>

        <div class="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            :class="BTN_SECONDARY"
            :disabled="!canUndo()"
            title="Ctrl/Cmd+Z"
            @click="undo() || toast('没有可撤销的操作')"
          >
            撤销
          </button>
          <button
            type="button"
            :class="BTN_PRIMARY"
            :disabled="!state.dirty || state.saving"
            title="Ctrl/Cmd+S"
            @click="doSave"
          >
            {{ state.saving ? '保存中…' : '保存' }}
          </button>
          <button type="button" :class="BTN_GHOST_DANGER" title="退出登录" @click="logout">
            <AdminIcon name="logout" :size="14" />
            退出登录
          </button>
        </div>
      </header>

      <p
        v-if="state.error"
        class="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 lg:mx-6 dark:bg-red-950/40 dark:text-red-400"
      >
        {{ state.error }}
      </p>

      <main class="hn-scroll min-h-0 flex-1 p-4 lg:p-6">
        <div class="mx-auto w-full max-w-5xl">
          <LinksPanel v-if="state.panel === 'links'" />
          <CategoriesPanel v-else-if="state.panel === 'categories'" />
          <SearchPanel v-else-if="state.panel === 'search'" />
          <DataPanel v-else-if="state.panel === 'data'" />
          <BackupPanel v-else-if="state.panel === 'backup'" />
          <SettingsPanel v-else />
        </div>
      </main>
    </div>

    <!-- 409 冲突 -->
    <Modal v-if="state.conflict" title="数据已在别处被修改" @close="conflictDiscard">
      <div class="space-y-3 text-sm">
        <p class="text-slate-600 dark:text-slate-300">
          另一个窗口或设备先保存了数据（服务端 rev
          {{ conflictDiff?.serverRev }}，你的编辑基于 rev {{ conflictDiff?.myRev }}）。
        </p>
        <p v-if="conflictDiff" class="rounded-lg bg-slate-900/[0.04] px-3 py-2 text-xs text-slate-500 dark:bg-white/[0.06]">
          服务端版本比你多/少的链接：你这边新增 {{ conflictDiff.added }} 条、删除 {{ conflictDiff.removed }} 条。
        </p>
        <div class="flex flex-col gap-2 pt-1">
          <button
            type="button"
            class="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
            @click="conflictDiscard"
          >
            放弃我的改动并刷新（推荐）
          </button>
          <button
            type="button"
            class="rounded-lg bg-slate-900/[0.06] px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-900/[0.1] dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
            @click="showDiff = true"
          >
            查看差异
          </button>
          <button
            type="button"
            class="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
            @click="conflictForce"
          >
            强制用我的版本覆盖
          </button>
        </div>
      </div>
    </Modal>

    <Modal v-if="showDiff" title="差异说明" @close="showDiff = false">
      <div class="space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <p>服务端在你编辑期间被更新。两个版本的差异摘要：</p>
        <ul class="list-disc space-y-1 pl-5 text-xs">
          <li>你新增的链接：{{ conflictDiff?.added ?? 0 }} 条</li>
          <li>你删除的链接（服务端仍有）：{{ conflictDiff?.removed ?? 0 }} 条</li>
          <li>服务端文档更新时间戳：{{ conflictDiff?.serverTime ? new Date(conflictDiff.serverTime).toLocaleString() : '—' }}</li>
        </ul>
        <p class="text-xs text-slate-400">选择「放弃并刷新」最安全；「强制覆盖」会用你的版本顶掉服务端的变更。</p>
      </div>
    </Modal>

    <!-- Toast -->
    <Teleport to="body">
      <div v-if="state.toast" class="pointer-events-none fixed left-1/2 top-4 z-[10000] -translate-x-1/2">
        <div class="glass-surface rounded-full px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-100">
          {{ state.toast }}
        </div>
      </div>
    </Teleport>
  </div>
</template>
