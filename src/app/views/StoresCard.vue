<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import type * as Y from 'yjs'
import {
  type CategoryId,
  categoryName,
  createStore,
  deleteStore,
  getStores,
  moveCategory,
  setStoreOrder,
} from '@/core/base'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import AppTextField from '@/ui/components/AppTextField.vue'

const props = defineProps<{ doc: Y.Doc; version: number }>()

const stores = computed(() => (props.version, getStores(props.doc)))
const editing = ref<string>()
const newName = ref('')
const announcement = ref('')

function add() {
  if (!newName.value.trim()) return
  editing.value = createStore(props.doc, newName.value)
  newName.value = ''
}

function move(storeId: string, order: CategoryId[], category: CategoryId, delta: number) {
  const next = moveCategory(order, category, delta)
  setStoreOrder(props.doc, storeId, next)
  // Für Screenreader ansagen, wohin die Kategorie gerutscht ist.
  announcement.value = `${categoryName(category)} jetzt an Position ${next.indexOf(category) + 1}`
}
</script>

<template>
  <AppCard>
    <h2>Läden</h2>
    <p class="muted">
      Jeder Laden hat seine eigene Reihenfolge der Kategorien – so, wie du durch die Gänge gehst.
    </p>
    <ul class="stores">
      <li v-for="store in stores" :key="store.id">
        <div class="store__head">
          <strong>{{ store.name }}</strong>
          <div class="row">
            <AppButton
              variant="ghost"
              :aria-expanded="editing === store.id"
              @click="editing = editing === store.id ? undefined : store.id"
            >
              Reihenfolge<span class="visually-hidden">: {{ store.name }}</span>
            </AppButton>
            <AppButton variant="danger" @click="deleteStore(doc, store.id)">
              Löschen<span class="visually-hidden">: {{ store.name }}</span>
            </AppButton>
          </div>
        </div>
        <ol v-if="editing === store.id" class="order">
          <li v-for="(category, index) in store.order" :key="category">
            <span>{{ categoryName(category) }}</span>
            <span class="row">
              <AppButton
                variant="ghost"
                :disabled="index === 0"
                @click="move(store.id, store.order, category, -1)"
              >
                ↑<span class="visually-hidden">{{ categoryName(category) }} nach oben</span>
              </AppButton>
              <AppButton
                variant="ghost"
                :disabled="index === store.order.length - 1"
                @click="move(store.id, store.order, category, 1)"
              >
                ↓<span class="visually-hidden">{{ categoryName(category) }} nach unten</span>
              </AppButton>
            </span>
          </li>
        </ol>
      </li>
    </ul>
    <form class="add" @submit.prevent="add">
      <AppTextField v-model="newName" label="Neuer Laden" maxlength="60" />
      <AppButton type="submit" :disabled="!newName.trim()">Anlegen</AppButton>
    </form>
    <p class="visually-hidden" role="status">{{ announcement }}</p>
  </AppCard>
</template>

<style scoped>
.muted {
  color: var(--text-muted);
}
.stores,
.order {
  margin: 0;
  padding: 0;
  list-style: none;
}
.stores > li {
  border-bottom: 1px solid var(--border);
  padding: var(--space-2) 0;
}
.store__head,
.order li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.order {
  margin: var(--space-2) 0 var(--space-2) var(--space-4);
}
.row {
  display: flex;
  gap: var(--space-1);
}
.add {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.add > :first-child {
  flex: 1;
}
</style>
