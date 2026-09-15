<script setup lang="ts">
/**
 * 账户动作组（「返回前台」+「退出登录」）。
 * 桌面端作为左侧栏下方的一块独立卡片；移动端抽屉底部复用同一组件，避免两处维护。
 */
import AdminIcon from './AdminIcon.vue';
import { NAV_IDLE, NAV_ITEM } from '../lib/adminUi';
import { logout } from '../lib/adminStore';

const itemCls = NAV_ITEM + NAV_IDLE;
</script>

<template>
  <div class="space-y-1">
    <a href="/" target="_blank" rel="noopener noreferrer" :class="itemCls" title="打开前台导航页">
      <AdminIcon name="external" :size="16" />
      <span class="flex-1 truncate text-left">返回前台</span>
    </a>
    <button type="button" :class="itemCls" title="退出登录" @click="logout">
      <AdminIcon name="logout" :size="16" />
      <span class="flex-1 truncate text-left">退出登录</span>
    </button>
  </div>
</template>
