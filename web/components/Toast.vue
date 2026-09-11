<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed left-1/2 top-4 z-[10000] -translate-x-1/2">
      <div
        class="animate-slide-down flex items-center gap-2 rounded-full bg-blue-50 px-6 py-3 text-sm text-blue-600 shadow-lg dark:bg-blue-900/30 dark:text-blue-400"
      >
        <slot name="icon" />
        <span>{{ message }}</span>
      </div>
    </div>
  </Teleport>
</template>
