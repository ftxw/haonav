<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AdminIcon from './components/AdminIcon.vue';
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

const password = ref('');
const loggingIn = ref(false);
const showDiff = ref(false);

/** 左侧导航 6 分区（面板状态集中在 adminStore.state.panel） */
const PANELS: { id: PanelId; label: string; icon: string }[] = [
  { id: 'links', label: '链接', icon: 'list' },
  { id: 'categories', label: '分类', icon: 'grid' },
  { id: 'search', label: '搜索', icon: 'search' },
  { id: 'data', label: '数据', icon: 'upload' },
  { id: 'backup', label: '备份', icon: 'download' },
  { id: 'settings', label: '设置', icon: 'gear' },
];

const currentPanel = computed(() => PANELS.find((p) => p.id === state.panel) ?? PANELS[0]);
const siteName = computed(() => state.doc?.settings.name || 'HaoNav');
const brandChar = computed(() => Array.from(siteName.value.trim())[0] || 'H');

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
  }
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

/** 左侧导航项：选中 emerald 底色 + 右侧小圆点（与前台同款观感） */
const navCls = (active: boolean): string =>
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ' +
  (active
    ? 'bg-emerald-50 font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
    : 'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-white');
</script>

<!-- 背景层：与前台同款渐变 + 光斑（登录页与主界面共用） -->
<template>
  <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gray-100 dark:bg-[#0f172a]">
    <div class="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-[#0f172a] dark:to-[#1e293b]"></div>
    <div
      class="animate-blob absolute left-[-10%] top-[-10%] h-[800px] w-[800px] rounded-full bg-emerald-200/30 blur-[150px] mix-blend-multiply dark:bg-indigo-900/20 dark:mix-blend-screen"
    ></div>
    <div
      class="animate-blob-slow absolute bottom-[-15%] right-[-10%] h-[700px] w-[700px] rounded-full bg-teal-200/30 blur-[150px] mix-blend-multiply dark:bg-emerald-900/20 dark:mix-blend-screen"
    ></div>
  </div>

  <!-- ═════════ 登录 ═════════ -->
  <div v-if="state.checking" class="flex min-h-screen items-center justify-center text-sm text-slate-400">
    正在检查登录状态…
  </div>

  <div v-else-if="!state.authed" class="flex min-h-screen items-center justify-center p-6">
    <form
      class="w-full max-w-sm rounded-2xl border border-slate-200/60 bg-white/80 p-8 shadow-sm backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-800/80"
      @submit.prevent="doLogin"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white shadow-lg shadow-emerald-500/30"
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
        class="mt-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <p v-if="state.error" class="mt-2 text-xs text-red-500">{{ state.error }}</p>
      <button
        type="submit"
        class="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        :disabled="loggingIn || !password"
      >
        {{ loggingIn ? '登录中…' : '登录' }}
      </button>
    </form>
  </div>

  <!-- ═════════ 主界面：左侧固定导航 + 右侧内容区 ═════════ -->
  <div v-else class="flex h-screen overflow-hidden">
    <!-- 左侧导航（w-60 ≈ 15rem）：毛玻璃，与前台侧栏同款 -->
    <aside
      class="flex w-60 shrink-0 flex-col border-r border-slate-200/40 bg-white/60 backdrop-blur-xl dark:border-slate-700/40 dark:bg-[#0f172a]/60"
    >
      <div class="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/40 px-5 dark:border-slate-700/40">
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-600 text-base font-bold text-white shadow-lg shadow-emerald-500/30"
        >
          {{ brandChar }}
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{{ siteName }}</p>
          <p class="text-[11px] text-slate-400">管理后台</p>
        </div>
      </div>

      <nav class="hn-scroll no-scrollbar flex-1 space-y-1 overflow-y-auto p-3">
        <button
          v-for="p in PANELS"
          :key="p.id"
          type="button"
          :class="navCls(state.panel === p.id)"
          @click="state.panel = p.id"
        >
          <AdminIcon :name="p.icon" :size="16" />
          <span class="flex-1 truncate text-left">{{ p.label }}</span>
          <span v-if="state.panel === p.id" class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        </button>
      </nav>

      <div class="shrink-0 space-y-1 border-t border-slate-200/40 p-3 dark:border-slate-700/40">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          :class="navCls(false)"
          title="打开前台导航页"
        >
          <AdminIcon name="external" :size="16" />
          <span class="flex-1 truncate text-left">返回前台</span>
        </a>
        <button type="button" :class="navCls(false)" @click="logout">
          <AdminIcon name="logout" :size="16" />
          <span class="flex-1 truncate text-left">退出登录</span>
        </button>
      </div>
    </aside>

    <!-- 右侧：顶栏 + 独立滚动的内容区 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex h-14 shrink-0 flex-wrap items-center gap-3 border-b border-slate-200/40 bg-white/60 px-4 backdrop-blur-xl lg:px-6 dark:border-slate-700/40 dark:bg-[#0f172a]/60"
      >
        <h1 class="text-sm font-bold text-slate-800 dark:text-slate-100">{{ currentPanel.label }}</h1>
        <span class="text-xs text-slate-400">rev {{ state.doc?.rev ?? '—' }}</span>
        <span v-if="state.dirty" class="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>未保存
        </span>

        <div class="ml-auto flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-700 dark:text-slate-200"
            :disabled="!canUndo()"
            title="Ctrl/Cmd+Z"
            @click="undo() || toast('没有可撤销的操作')"
          >
            撤销
          </button>
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!state.dirty || state.saving"
            title="Ctrl/Cmd+S"
            @click="doSave"
          >
            {{ state.saving ? '保存中…' : '保存' }}
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
        <p v-if="conflictDiff" class="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60">
          服务端版本比你多/少的链接：你这边新增 {{ conflictDiff.added }} 条、删除 {{ conflictDiff.removed }} 条。
        </p>
        <div class="flex flex-col gap-2 pt-1">
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            @click="conflictDiscard"
          >
            放弃我的改动并刷新（推荐）
          </button>
          <button
            type="button"
            class="rounded-lg bg-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
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
        <div class="rounded-full bg-slate-900/95 px-5 py-2.5 text-sm text-white shadow-lg dark:bg-slate-700">
          {{ state.toast }}
        </div>
      </div>
    </Teleport>
  </div>
</template>
