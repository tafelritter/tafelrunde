<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
defineProps<{ label: string }>()
const checked = defineModel<boolean>({ default: false })
</script>

<template>
  <label class="checkbox">
    <input v-model="checked" type="checkbox" />
    <span>{{ label }}</span>
  </label>
</template>

<style scoped>
.checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--touch-target);
  cursor: pointer;
}
input {
  width: 1.375rem;
  height: 1.375rem;
  margin: 0;
  accent-color: var(--primary);
}
</style>
