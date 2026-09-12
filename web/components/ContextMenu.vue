<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import type { IndexedLink } from '../stores/nav';

const props = defineProps<{ x: number; y: number; link: IndexedLink; openInNewTab: boolean }>();
const emit = defineEmits<{ copy: []; share: []; close: []; open: [] }>();

const el = ref<HTMLElement | null>(null);
const pos = ref({ x: props.x, y: props.y });

function onOutside(e: PointerEvent): void {
  if (el.value && !el.value.contains(e.target as Node)) emit('close');
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close');
}
function onScroll(): void {
  emit('close');
}

onMounted(() => {
  // 贴边时向内收，避免溢出视口
  const w = el.value?.offsetWidth ?? 176;
  const h = el.value?.offsetHeight ?? 116;
  pos.value = {
    x: Math.max(8, Math.min(props.x, window.innerWidth - w - 8)),
    y: Math.max(8, Math.min(props.y, window.innerHeight - h - 8)),
  };
  window.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onScroll);
  document.addEventListener('scroll', onScroll, true);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onScroll);
  document.removeEventListener('scroll', onScroll, true);
});

const itemClass =
  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-white/50 hover:text-accent dark:text-slate-200 dark:hover:bg-white/10';
</script>

<template>
  <Teleport to="body">
    <div
      ref="el"
      class="animate-zoom-in glass-surface fixed z-[9999] w-44 overflow-hidden rounded-2xl py-1"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      role="menu"
    >
      <button type="button" :class="itemClass" @click="emit('copy')">
        <AppIcon name="copy" :size="16" />
        <span>复制链接</span>
      </button>
      <button type="button" :class="itemClass" @click="emit('share')">
        <AppIcon name="qrcode" :size="16" />
        <span>二维码分享</span>
      </button>
      <button v-if="openInNewTab" type="button" :class="itemClass" @click="emit('open')">
        <AppIcon name="external" :size="16" />
        <span>在新标签打开</span>
      </button>
    </div>
  </Teleport>
</template>
