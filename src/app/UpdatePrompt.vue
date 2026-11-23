<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { useServiceWorker } from './pwa'
import AppToast from '@/ui/components/AppToast.vue'
import AppButton from '@/ui/components/AppButton.vue'

const { needRefresh, offlineReady, update } = useServiceWorker()
</script>

<template>
  <AppToast v-if="needRefresh" tone="info">
    Eine neue Version ist verfügbar.
    <template #actions>
      <AppButton variant="primary" @click="update">Neu laden</AppButton>
      <AppButton variant="ghost" @click="needRefresh = false">Später</AppButton>
    </template>
  </AppToast>
  <AppToast
    v-else-if="offlineReady"
    tone="success"
    :duration="6000"
    @dismiss="offlineReady = false"
  >
    Die App ist jetzt auch offline verfügbar.
  </AppToast>
</template>
