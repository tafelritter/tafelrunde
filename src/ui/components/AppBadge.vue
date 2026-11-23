<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'accent' | 'family-1' | 'family-2' | 'family-3' }>(), {
  tone: 'accent',
})
</script>

<template>
  <span :class="['badge', `badge--${tone}`]"><slot /></span>
</template>

<style scoped>
.badge {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
  font-weight: 600;
  line-height: 1.6;
}
.badge--accent {
  background: var(--accent);
  color: var(--on-accent);
}
.badge--family-1 {
  background: var(--badge-1);
  color: var(--on-badge);
}
.badge--family-2 {
  background: var(--badge-2);
  color: var(--on-badge);
}
.badge--family-3 {
  background: var(--badge-3);
  color: var(--on-badge);
}
</style>
