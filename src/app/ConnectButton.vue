<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/ui/components/AppButton.vue'
import { auth, authVersion, currentRoute } from './storage'

/** Nur sichtbar, wenn Google konfiguriert ist und gerade kein gültiges Token vorliegt. */
const visible = computed(() => {
  void authVersion.value
  return !!auth && !auth.accessToken()
})
const label = computed(() => (auth?.wasConnected ? 'Erneut anmelden' : 'Mit Google verbinden'))
</script>

<template>
  <AppButton v-if="visible" variant="ghost" @click="auth?.login(currentRoute())">{{
    label
  }}</AppButton>
</template>
