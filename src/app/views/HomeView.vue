<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import type { Workspace } from '../workspace/workspace'
import { bumpWorkspace, workspace, workspaceVersion } from '../workspace/use-workspace'
import SpaceSection from './SpaceSection.vue'

const router = useRouter()
const ws = shallowRef<Workspace>()
onMounted(async () => {
  ws.value = await workspace()
  await ws.value.startSync()
})

/** Haushalte zuerst, der persönliche Bereich am Ende. */
const spaces = computed(() => {
  void workspaceVersion.value
  // Rezept-Freigaben gehören zu den Rezepten, nicht zu den Einkaufslisten.
  const all = (ws.value?.spaces() ?? []).filter((s) => s.kind !== 'recipe-share')
  return [...all.filter((s) => s.kind !== 'personal'), ...all.filter((s) => s.kind === 'personal')]
})

const dialogOpen = ref(false)
const householdName = ref('')
async function createHousehold() {
  if (!ws.value || !householdName.value.trim()) return
  const handle = await ws.value.createSpace(householdName.value, 'household')
  householdName.value = ''
  dialogOpen.value = false
  bumpWorkspace()
  await router.push({ name: 'space', params: { spaceId: handle.record.id } })
}
</script>

<template>
  <h1>Einkaufslisten</h1>
  <div class="stack">
    <SpaceSection v-for="space in spaces" :key="space.id" :space-id="space.id" />
    <div>
      <AppButton @click="dialogOpen = true">Haushalt anlegen</AppButton>
    </div>
  </div>
  <AppDialog v-model:open="dialogOpen" title="Haushalt anlegen">
    <form id="household-form" @submit.prevent="createHousehold">
      <AppTextField
        v-model="householdName"
        label="Name des Haushalts"
        hint="Zum Beispiel „Familie Müller“. Danach kannst du andere einladen."
        maxlength="80"
      />
    </form>
    <template #actions>
      <AppButton @click="dialogOpen = false">Abbrechen</AppButton>
      <AppButton
        type="submit"
        form="household-form"
        variant="primary"
        :disabled="!householdName.trim()"
      >
        Anlegen
      </AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.stack {
  display: grid;
  gap: var(--space-4);
}
</style>
