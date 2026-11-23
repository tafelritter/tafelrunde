<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section class="card"><slot /></section>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  padding: var(--space-4);
}
.card > :deep(:first-child) {
  margin-top: 0;
}
.card > :deep(:last-child) {
  margin-bottom: 0;
}
</style>
