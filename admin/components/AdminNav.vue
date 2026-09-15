<script lang="ts">
import type { PanelId } from '../lib/adminStore';

/**
 * 后台导航分组（单一数据源）。
 * 桌面侧栏与移动端抽屉都渲染本组件，顶栏面包屑也从这里扁平化取名，避免两处维护。
 */
export const PANEL_GROUPS: { title: string; items: { id: PanelId; label: string; icon: string }[] }[] = [
  {
    title: '站点内容',
    items: [
      { id: 'links', label: '链接', icon: 'list' },
      { id: 'categories', label: '分类', icon: 'grid' },
      { id: 'search', label: '搜索', icon: 'search' },
    ],
  },
  {
    title: '数据与备份',
    items: [
      { id: 'data', label: '数据', icon: 'upload' },
      { id: 'backup', label: '备份', icon: 'download' },
    ],
  },
  {
    title: '系统设置',
    items: [{ id: 'settings', label: '设置', icon: 'gear' }],
  },
];
</script>

<script setup lang="ts">
import { computed } from 'vue';
import AdminIcon from './AdminIcon.vue';
import { NAV_ACTIVE, NAV_IDLE, SECTION_LABEL } from '../lib/adminUi';
import { logout, state } from '../lib/adminStore';

/** 只抛事件，不在这里直接改 state.panel —— 由 App.vue 接住，顺便关闭移动端抽屉 */
const emit = defineEmits<{ pick: [id: PanelId] }>();

const siteName = computed(() => state.doc?.settings.name || 'HaoNav');
const brandChar = computed(() => Array.from(siteName.value.trim())[0] || 'H');

/** 导航项：选中态走 adminUi 令牌（与前台同语言），组内项写法对齐参考站 */
const navCls = (active: boolean): string =>
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ' +
  (active ? NAV_ACTIVE : NAV_IDLE);
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <!-- 品牌块（参考图：圆形头像 + 站点名 + 角色；logo 渐变属既有品牌硬编码，保持不动） -->
    <div class="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200/70 px-4 dark:border-white/10">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-md shadow-emerald-500/30 ring-2 ring-white/70 dark:ring-white/10"
      >
        {{ brandChar }}
      </div>
      <div class="min-w-0">
        <p class="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{{ siteName }}</p>
        <p class="text-[11px] text-slate-400">管理后台</p>
      </div>
    </div>

    <!-- 分组导航 -->
    <nav class="hn-scroll no-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <div v-for="g in PANEL_GROUPS" :key="g.title">
        <p class="px-3 pb-1.5" :class="SECTION_LABEL">{{ g.title }}</p>
        <div class="space-y-1">
          <button
            v-for="p in g.items"
            :key="p.id"
            type="button"
            :class="navCls(state.panel === p.id)"
            @click="emit('pick', p.id)"
          >
            <AdminIcon :name="p.icon" :size="16" />
            <span class="flex-1 truncate text-left">{{ p.label }}</span>
          </button>
        </div>
      </div>
    </nav>

    <!-- 底部：返回前台 + 退出登录（参考图把登出放在侧栏底部） -->
    <div class="shrink-0 space-y-1 border-t border-slate-200/70 p-3 dark:border-white/10">
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
      <button type="button" :class="navCls(false)" title="退出登录" @click="logout">
        <AdminIcon name="logout" :size="16" />
        <span class="flex-1 truncate text-left">退出登录</span>
      </button>
    </div>
  </div>
</template>
