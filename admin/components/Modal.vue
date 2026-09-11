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
    <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" @click.self="emit('close')">
      <div
        class="flex max-h-[86vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
        :class="wide ? 'max-w-3xl' : 'max-w-md'"
      >
        <div class="flex shrink-0 items-center border-b border-slate-200 px-5 py-3.5 dark:border-slate-700">
          <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">{{ title }}</h3>
          <button
            type="button"
            aria-label="关闭"
            class="ml-auto rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
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
