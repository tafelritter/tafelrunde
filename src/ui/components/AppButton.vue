<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  { variant: 'secondary', type: 'button', disabled: false },
)
</script>

<template>
  <button :type="type" :disabled="disabled" :class="['btn', `btn--${variant}`]">
    <slot />
  </button>
</template>

<style scoped>
.btn {
  min-height: var(--touch-target);
  padding: 0 var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--on-primary);
}
.btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--primary);
}
.btn--danger {
  border-color: var(--error);
  color: var(--error);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
