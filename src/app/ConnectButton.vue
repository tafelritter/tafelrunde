<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import { auth, authVersion, currentRoute } from './storage'

/**
 * Ohne Google-Projekt führt der Knopf zur Einrichtung; mit Projekt meldet er an,
 * solange kein gültiges Token vorliegt.
 */
const visible = computed(() => {
  void authVersion.value
  return !auth || !auth.accessToken()
})
const label = computed(() => (auth?.wasConnected ? 'Erneut anmelden' : 'Mit Google verbinden'))
</script>

<template>
  <template v-if="visible">
    <AppButton v-if="auth" variant="ghost" @click="auth.login(currentRoute())">{{
      label
    }}</AppButton>
    <RouterLink v-else class="connect-link" :to="{ name: 'google' }"
      >Mit Google verbinden</RouterLink
    >
  </template>
</template>

<style scoped>
.connect-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target);
  padding: 0 var(--space-4);
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
}
</style>
