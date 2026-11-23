<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

/** Antippbarer Timer im Rezepttext. Läuft, solange die Seite offen ist. */
const props = defineProps<{
  label: string
  seconds: number | undefined
  name?: string | undefined
}>()

const endsAt = ref<number>()
const now = ref(Date.now())
const done = ref(false)
let tick: ReturnType<typeof setInterval> | undefined

const remaining = computed(() =>
  endsAt.value === undefined
    ? undefined
    : Math.max(0, Math.round((endsAt.value - now.value) / 1000)),
)

function format(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`
}

function toggle() {
  if (props.seconds === undefined) return
  if (endsAt.value !== undefined) {
    stop()
    return
  }
  done.value = false
  endsAt.value = Date.now() + props.seconds * 1000
  now.value = Date.now()
  tick = setInterval(() => {
    now.value = Date.now()
    if (remaining.value === 0) {
      stop()
      done.value = true
      navigator.vibrate?.([300, 150, 300])
    }
  }, 500)
}

function stop() {
  clearInterval(tick)
  tick = undefined
  endsAt.value = undefined
}

onBeforeUnmount(stop)
</script>

<template>
  <button
    type="button"
    :class="['timer', { 'timer--running': endsAt !== undefined, 'timer--done': done }]"
    :aria-pressed="endsAt !== undefined"
    :disabled="seconds === undefined"
    @click="toggle"
  >
    <span aria-hidden="true">⏱</span>
    <template v-if="remaining !== undefined">{{ format(remaining) }}</template>
    <template v-else>{{ label }}</template>
    <span class="visually-hidden">{{
      endsAt !== undefined ? ' – Timer anhalten' : ' – Timer starten'
    }}</span>
  </button>
  <span v-if="done" role="alert" class="visually-hidden"
    >Timer {{ name ?? label }} ist abgelaufen.</span
  >
</template>

<style scoped>
.timer {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 2rem;
  padding: 0 var(--space-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.timer--running {
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}
.timer--done {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}
</style>
