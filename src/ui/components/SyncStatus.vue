<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed } from 'vue'
import { SYNC_LABELS, type SyncState } from '@/ui/sync-state'

const props = defineProps<{ state: SyncState; lastSync?: Date | undefined }>()

const label = computed(() => SYNC_LABELS[props.state])
const time = computed(() =>
  props.lastSync
    ? props.lastSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null,
)
const tone = computed(() =>
  props.state === 'synced' || props.state === 'local'
    ? 'ok'
    : props.state === 'pending'
      ? 'busy'
      : 'warn',
)
</script>

<template>
  <p :class="['sync', `sync--${tone}`]" role="status" aria-live="polite">
    <span class="sync__dot" aria-hidden="true"></span>
    <span>{{ label }}</span>
    <span v-if="time" class="sync__time">· {{ time }}</span>
  </p>
</template>

<style scoped>
.sync {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.sync__dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  background: var(--primary);
}
.sync--busy .sync__dot {
  background: var(--accent);
}
.sync--warn {
  color: var(--warning);
}
.sync--warn .sync__dot {
  background: var(--warning);
}
</style>
