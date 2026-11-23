<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
defineProps<{ label: string; detail?: string; hint?: string | undefined }>()
const done = defineModel<boolean>('done', { default: false })
</script>

<template>
  <li :class="['item', { 'item--done': done }]">
    <label class="item__main">
      <input v-model="done" type="checkbox" />
      <span class="item__label">
        {{ label }}
        <small v-if="hint" class="item__hint">{{ hint }}</small>
      </span>
      <span v-if="detail" class="item__detail">{{ detail }}</span>
    </label>
    <slot name="actions" />
  </li>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target);
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--border);
  list-style: none;
}
.item__main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
}
input {
  width: 1.375rem;
  height: 1.375rem;
  margin: 0;
  accent-color: var(--primary);
}
.item__label {
  flex: 1;
}
.item__hint {
  display: block;
  color: var(--text-muted);
}
.item__detail {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
/* Text bleibt bei 4,5:1 (WCAG 1.4.3); --checked (etwa 3:1) nur für die Linie. */
.item--done .item__label,
.item--done .item__hint {
  display: block;
  color: var(--text-muted);
}
.item__detail {
  color: var(--text-muted);
  text-decoration: line-through;
  text-decoration-color: var(--checked);
}
</style>
