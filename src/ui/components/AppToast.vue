<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

const props = withDefaults(
  defineProps<{
    tone?: 'info' | 'success' | 'warning' | 'error'
    /** Schließt den Hinweis nach so vielen Millisekunden (0 = nie); nur für reine Informationen. */
    duration?: number
  }>(),
  { tone: 'info', duration: 0 },
)
const emit = defineEmits<{ dismiss: [] }>()

let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (props.duration > 0) timer = setTimeout(() => emit('dismiss'), props.duration)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div
    :class="['toast', `toast--${tone}`]"
    :role="tone === 'error' ? 'alert' : 'status'"
    :aria-live="tone === 'error' ? 'assertive' : 'polite'"
  >
    <div class="toast__text"><slot /></div>
    <div class="toast__actions">
      <slot name="actions">
        <button type="button" class="toast__close" aria-label="Schließen" @click="$emit('dismiss')">
          ×
        </button>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  inset: auto var(--space-4) var(--space-4);
  max-width: 32rem;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-left: 4px solid var(--primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  z-index: 50;
}
.toast--warning {
  border-left-color: var(--warning);
}
.toast--error {
  border-left-color: var(--error);
}
.toast__text {
  flex: 1;
}
.toast__actions {
  display: flex;
  gap: var(--space-2);
}
.toast__close {
  min-width: var(--touch-target);
  min-height: var(--touch-target);
  border: 0;
  background: transparent;
  color: var(--text);
  font-size: var(--font-size-lg);
  cursor: pointer;
}
</style>
