<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import type { IndexedLink } from '../stores/nav';

const props = defineProps<{ link: IndexedLink }>();
const emit = defineEmits<{ close: [] }>();

const svg = ref('');
const failed = ref(false);

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  try {
    // 二维码库动态 import：只在打开分享弹窗时才加载，不进首屏
    const { renderSVG } = await import('uqr');
    svg.value = renderSVG(props.link.url, {
      ecc: 'M',
      border: 2,
      pixelSize: 6,
      blackColor: '#0f172a',
      whiteColor: '#ffffff',
    });
  } catch {
    failed.value = true;
  }
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div
      class="veil fixed inset-0 z-[100] flex items-center justify-center p-4"
      @click.self="emit('close')"
    >
      <div class="animate-zoom-in glass-surface flex w-full max-w-xs flex-col items-center gap-4 rounded-3xl p-6">
        <div class="flex w-full items-center gap-2">
          <AppIcon name="qrcode" :size="18" class="text-accent" />
          <span class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{{ link.title }}</span>
          <button
            type="button"
            aria-label="关闭"
            class="ml-auto rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/50 hover:text-slate-600 dark:hover:bg-white/10"
            @click="emit('close')"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </div>

        <!-- 二维码必须落在纯白底上（保证扫码对比度），故内层保留白底 -->
        <div class="w-full rounded-2xl bg-white p-3" :class="{ 'min-h-48': !svg }">
          <div v-if="svg" class="[&>svg]:h-auto [&>svg]:w-full" v-html="svg" />
          <p v-else-if="failed" class="py-10 text-center text-sm text-slate-400">二维码生成失败</p>
          <p v-else class="py-10 text-center text-sm text-slate-400">生成中…</p>
        </div>

        <p class="w-full break-all text-center text-xs text-slate-500 dark:text-slate-400">{{ link.url }}</p>
      </div>
    </div>
  </Teleport>
</template>
