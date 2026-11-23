<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { readTheme, setTheme, type Theme } from '@/ui/theme'

const theme = ref<Theme>(readTheme())
watch(theme, (value) => setTheme(value))
</script>

<template>
  <label class="theme">
    <span class="visually-hidden">Farbschema</span>
    <select v-model="theme">
      <option value="system">System</option>
      <option value="light">Hell</option>
      <option value="dark">Dunkel</option>
    </select>
  </label>
</template>

<style scoped>
select {
  min-height: var(--touch-target);
  padding: 0 var(--space-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
</style>
