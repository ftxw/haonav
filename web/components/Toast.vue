<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed left-1/2 top-4 z-[10000] -translate-x-1/2">
      <div
        class="animate-slide-down glass-surface flex items-center gap-2 rounded-full px-6 py-3 text-sm text-accent"
      >
        <slot name="icon" />
        <span>{{ message }}</span>
      </div>
    </div>
  </Teleport>
</template>
