<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createList, getItems, getLists, spaceName } from '@/core/base'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import { useSpace } from '../workspace/use-space'
import { recoveryHintVersion, recoverySeen } from '../recovery-hint'

const props = defineProps<{ spaceId: string }>()
const router = useRouter()
const { doc, version, error } = useSpace(toRef(props, 'spaceId'))

const name = computed(() => (version.value, doc.value ? spaceName(doc.value) : ''))
const lists = computed(() => {
  void version.value
  const d = doc.value
  if (!d) return []
  return getLists(d).map((l) => ({
    ...l,
    open: getItems(d, l.id).filter((i) => !i.checked).length,
  }))
})

const showRecoveryHint = computed(() => {
  void recoveryHintVersion.value
  return lists.value.length > 0 && !recoverySeen(props.spaceId)
})

const newList = ref('')
async function addList() {
  if (!doc.value || !newList.value.trim()) return
  const id = createList(doc.value, newList.value)
  newList.value = ''
  await router.push({ name: 'list', params: { spaceId: props.spaceId, listId: id } })
}
</script>

<template>
  <AppCard>
    <div class="head">
      <h2>{{ name || 'Bereich' }}</h2>
      <RouterLink :to="{ name: 'space', params: { spaceId } }">Mitglieder & Einladen</RouterLink>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="showRecoveryHint" class="hint">
      Sichere den
      <RouterLink :to="{ name: 'space', params: { spaceId } }">Wiederherstellungscode</RouterLink>:
      Ohne ihn sind die Daten verloren, wenn alle Geräte weg sind.
    </p>
    <ul v-if="lists.length" class="lists">
      <li v-for="list in lists" :key="list.id">
        <RouterLink :to="{ name: 'list', params: { spaceId, listId: list.id } }">
          {{ list.name }}
        </RouterLink>
        <span class="count">{{ list.open }} offen</span>
      </li>
    </ul>
    <p v-else class="muted">Noch keine Liste.</p>
    <form class="add" @submit.prevent="addList">
      <AppTextField v-model="newList" :label="`Neue Liste in „${name}“`" maxlength="80" />
      <AppButton type="submit" :disabled="!newList.trim()">Anlegen</AppButton>
    </form>
  </AppCard>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
.head h2 {
  margin: 0;
}
.lists {
  margin: var(--space-4) 0;
  padding: 0;
  list-style: none;
}
.lists li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: var(--touch-target);
  border-bottom: 1px solid var(--border);
}
.hint {
  padding: var(--space-2) var(--space-3);
  border-left: 4px solid var(--warning);
  background: var(--bg);
}
.count,
.muted {
  color: var(--text-muted);
}
.add {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}
.add > :first-child {
  flex: 1;
}
</style>
