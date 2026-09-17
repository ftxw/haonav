<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';

defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩：点卡片外**不关闭**（避免编辑到一半误触丢内容），关闭只走 × 按钮或 Esc。
         不加黑色蒙层 —— 黑色会把弹窗的玻璃质感压死，这里只用「磨砂」把背后页面糊掉：
         遮罩层 blur 负责虚化背景，卡片自身的 glass-surface 则把这层虚化当背景透出来。 -->
    <div class="glass-veil fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        class="glass-surface flex max-h-[86vh] w-full flex-col overflow-hidden rounded-3xl"
        :class="wide ? 'max-w-3xl' : 'max-w-md'"
      >
        <div class="flex shrink-0 items-center border-b border-slate-200/60 px-5 py-3.5 dark:border-white/10">
          <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">{{ title }}</h3>
          <button
            type="button"
            aria-label="关闭"
            class="ml-auto rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/50 hover:text-slate-600 dark:hover:bg-white/10"
            @click="emit('close')"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div class="hn-scroll min-h-0 flex-1 overflow-y-auto p-5">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
