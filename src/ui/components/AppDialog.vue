<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ref, useId, watch, onMounted } from 'vue'

defineProps<{ title: string }>()
const open = defineModel<boolean>('open', { default: false })
const dialog = ref<HTMLDialogElement>()
const titleId = useId()

function sync(value: boolean) {
  const el = dialog.value
  if (!el) return
  if (value && !el.open) el.showModal()
  if (!value && el.open) el.close()
}
onMounted(() => sync(open.value))
watch(open, sync)
</script>

<template>
  <dialog ref="dialog" class="dialog" :aria-labelledby="titleId" @close="open = false">
    <h2 :id="titleId">{{ title }}</h2>
    <div class="dialog__body"><slot /></div>
    <div class="dialog__actions"><slot name="actions" /></div>
  </dialog>
</template>

<style scoped>
.dialog {
  max-width: min(32rem, calc(100vw - 2 * var(--space-4)));
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 0.45);
}
.dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-6);
}
</style>
