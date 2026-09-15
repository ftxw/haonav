<script setup lang="ts">
import { computed } from 'vue';
import AdminIcon from './AdminIcon.vue';
import { NAV_ACTIVE, NAV_IDLE, NAV_ITEM, SECTION_LABEL } from '../lib/adminUi';
import { state, type PanelId } from '../lib/adminStore';
import { PANEL_GROUPS } from '../lib/panels';

/** 只抛事件，不在这里直接改 state.panel —— 由 App.vue 接住，顺便关闭移动端抽屉 */
const emit = defineEmits<{ pick: [id: PanelId] }>();

const siteName = computed(() => state.doc?.settings.name || 'HaoNav');
const brandChar = computed(() => Array.from(siteName.value.trim())[0] || 'H');

/** 导航项：选中态走 adminUi 令牌（实心主色块）；账户动作已抽到 AdminAccount.vue */
const navCls = (active: boolean): string => NAV_ITEM + (active ? NAV_ACTIVE : NAV_IDLE);
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
  </div>
</template>
