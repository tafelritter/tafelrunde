<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { ref } from 'vue'
import AppBadge from '@/ui/components/AppBadge.vue'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import AppCheckbox from '@/ui/components/AppCheckbox.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppListItem from '@/ui/components/AppListItem.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import AppToast from '@/ui/components/AppToast.vue'
import SyncStatus from '@/ui/components/SyncStatus.vue'
import { SYNC_LABELS, type SyncState } from '@/ui/sync-state'

const name = ref('')
const vegan = ref(true)
const items = ref([
  { label: 'Tomaten', detail: '500 g', done: false },
  { label: 'Basilikum', detail: '1 Bund', done: true },
  { label: 'Mozzarella', detail: '2 Stück', done: false },
])
const dialogOpen = ref(false)
const toastVisible = ref(false)
const states = Object.keys(SYNC_LABELS) as SyncState[]
</script>

<template>
  <h1>Basis-Komponenten</h1>
  <div class="stack">
    <AppCard>
      <h2>Buttons</h2>
      <div class="row">
        <AppButton variant="primary">Speichern</AppButton>
        <AppButton>Abbrechen</AppButton>
        <AppButton variant="ghost">Mehr</AppButton>
        <AppButton variant="danger">Löschen</AppButton>
        <AppButton disabled>Deaktiviert</AppButton>
      </div>
    </AppCard>

    <AppCard>
      <h2>Eingaben</h2>
      <div class="stack">
        <AppTextField v-model="name" label="Name" hint="So sehen dich die anderen im Haushalt." />
        <AppTextField label="Gerätename" error="Bitte einen Namen eingeben." />
        <AppCheckbox v-model="vegan" label="Nur vegane Rezepte" />
      </div>
    </AppCard>

    <AppCard>
      <h2>Liste</h2>
      <ul class="list">
        <AppListItem
          v-for="item in items"
          :key="item.label"
          v-model:done="item.done"
          :label="item.label"
          :detail="item.detail"
        />
      </ul>
    </AppCard>

    <AppCard>
      <h2>Badges</h2>
      <div class="row">
        <AppBadge>Neu</AppBadge>
        <AppBadge tone="family-1">Anna</AppBadge>
        <AppBadge tone="family-2">Ben</AppBadge>
        <AppBadge tone="family-3">Clara</AppBadge>
      </div>
    </AppCard>

    <AppCard>
      <h2>Sync-Status</h2>
      <div class="stack">
        <SyncStatus
          v-for="s in states"
          :key="s"
          :state="s"
          :last-sync="new Date(2026, 10, 20, 9, 41)"
        />
      </div>
    </AppCard>

    <AppCard>
      <h2>Dialog und Toast</h2>
      <div class="row">
        <AppButton @click="dialogOpen = true">Dialog öffnen</AppButton>
        <AppButton @click="toastVisible = true">Toast zeigen</AppButton>
      </div>
    </AppCard>
  </div>

  <AppDialog v-model:open="dialogOpen" title="Liste löschen?">
    <p>Die Liste wird für alle Mitglieder des Haushalts gelöscht.</p>
    <template #actions>
      <AppButton @click="dialogOpen = false">Abbrechen</AppButton>
      <AppButton variant="danger" @click="dialogOpen = false">Löschen</AppButton>
    </template>
  </AppDialog>
  <AppToast v-if="toastVisible" tone="success" @dismiss="toastVisible = false">
    Gespeichert.
  </AppToast>
</template>

<style scoped>
.stack {
  display: grid;
  gap: var(--space-4);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.list {
  margin: 0;
  padding: 0;
}
</style>
