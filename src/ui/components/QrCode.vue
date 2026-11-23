<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed } from 'vue'
import { encode } from 'uqr'

const props = defineProps<{ value: string; label: string }>()

/** Ein einziger SVG-Pfad aus allen dunklen Modulen – ohne innerHTML. */
const qr = computed(() => {
  const { data, size } = encode(props.value, { ecc: 'M', border: 2 })
  let d = ''
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`
    }),
  )
  return { d, size }
})
</script>

<template>
  <svg
    class="qr"
    role="img"
    :aria-label="label"
    :viewBox="`0 0 ${qr.size} ${qr.size}`"
    shape-rendering="crispEdges"
  >
    <rect width="100%" height="100%" fill="#fff" />
    <path :d="qr.d" fill="#000" />
  </svg>
</template>

<style scoped>
/* Immer Schwarz auf Weiß, auch im dunklen Modus – sonst scannen manche Kameras nicht. */
.qr {
  display: block;
  width: min(18rem, 100%);
  height: auto;
  border-radius: var(--radius-sm);
}
</style>
