<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  type CategoryId,
  type Item,
  CATEGORIES,
  addItem,
  categoryFor,
  categoryName,
  deleteList,
  findDuplicate,
  getItems,
  getLists,
  getStores,
  groupItems,
  mergeItems,
  removeChecked,
  removeItem,
  renameList,
  restoreItems,
  setChecked,
  setItemCategory,
  setListStore,
  spaceKind,
  updateItem,
} from '@/core/base'
import AppButton from '@/ui/components/AppButton.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppListItem from '@/ui/components/AppListItem.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import AppToast from '@/ui/components/AppToast.vue'
import { catalogLookup, catalogNames } from '../catalog'
import { useSpace } from '../workspace/use-space'
import { bumpWorkspace, workspace } from '../workspace/use-workspace'
import ConnectButton from '../ConnectButton.vue'

const props = defineProps<{ spaceId: string; listId: string }>()
const router = useRouter()
const { doc, version, error, snapshot } = useSpace(toRef(props, 'spaceId'), { active: true })
const kind = computed(() => (version.value, doc.value ? spaceKind(doc.value) : undefined))
const readOnly = computed(() => snapshot.value?.status === 'login-required')

// --- Mit anderen teilen (1.11) -----------------------------------------------------

const confirmShare = ref(false)
const shareError = ref<string>()
async function share() {
  shareError.value = undefined
  try {
    const target = await (await workspace()).shareList(props.spaceId, props.listId, catalogLookup)
    confirmShare.value = false
    bumpWorkspace()
    await router.replace({ name: 'space', params: { spaceId: target.record.id } })
  } catch (e) {
    shareError.value = e instanceof Error ? e.message : String(e)
  }
}
const deviceId = ref('')
void workspace().then((ws) => (deviceId.value = ws.profile?.deviceId ?? ''))

const list = computed(() => {
  void version.value
  return doc.value ? getLists(doc.value).find((l) => l.id === props.listId) : undefined
})
const items = computed(() => {
  void version.value
  return doc.value ? getItems(doc.value, props.listId) : []
})
const stores = computed(() => (version.value, doc.value ? getStores(doc.value) : []))
const store = computed(() => stores.value.find((s) => s.id === list.value?.storeId))
const groups = computed(() =>
  doc.value ? groupItems(doc.value, items.value, catalogLookup, store.value?.order) : [],
)
function chooseStore(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (doc.value) setListStore(doc.value, props.listId, value || undefined)
}
const hasChecked = computed(() => items.value.some((i) => i.checked))

/** Vorschläge: Katalog und alle bisherigen Einträge des Bereichs. */
const suggestions = computed(() => {
  void version.value
  const names = new Set(catalogNames())
  if (doc.value)
    for (const l of getLists(doc.value))
      for (const i of getItems(doc.value, l.id)) names.add(i.name)
  return [...names].sort((a, b) => a.localeCompare(b, 'de'))
})
const datalistId = useId()

// --- Hinzufügen ---------------------------------------------------------------

const name = ref('')
const quantity = ref('')
const unit = ref('')
const duplicate = ref<{ existing: Item; added: string }>()

function add() {
  const d = doc.value
  if (!d || !name.value.trim()) return
  const existing = findDuplicate(d, props.listId, name.value)
  const id = addItem(
    d,
    props.listId,
    { name: name.value, quantity: quantity.value, unit: unit.value },
    deviceId.value,
  )
  if (existing) duplicate.value = { existing, added: id }
  name.value = ''
  quantity.value = ''
  unit.value = ''
}

function mergeDuplicate() {
  if (doc.value && duplicate.value)
    mergeItems(doc.value, duplicate.value.existing.id, duplicate.value.added)
  duplicate.value = undefined
}

// --- Bearbeiten ---------------------------------------------------------------

const editing = ref<{
  id: string
  name: string
  quantity: string
  unit: string
  note: string
  category: CategoryId
}>()

function edit(item: Item) {
  if (!doc.value) return
  editing.value = {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    note: item.note,
    category: categoryFor(doc.value, item, catalogLookup),
  }
}

function saveEdit() {
  const d = doc.value
  const e = editing.value
  if (!d || !e || !e.name.trim()) return
  const before = items.value.find((i) => i.id === e.id)
  updateItem(d, e.id, { name: e.name, quantity: e.quantity, unit: e.unit, note: e.note })
  if (before && categoryFor(d, before, catalogLookup) !== e.category)
    setItemCategory(d, e.id, e.category)
  editing.value = undefined
}

function deleteEditing() {
  if (doc.value && editing.value) removeItem(doc.value, editing.value.id)
  editing.value = undefined
}

// --- Erledigte entfernen, Rückgängig --------------------------------------------

const undo = ref<{ text: string; items: Item[] }>()

function clearChecked() {
  if (!doc.value) return
  const removed = removeChecked(doc.value, props.listId)
  undo.value = { text: `${removed.length} erledigte entfernt.`, items: removed }
}

function undoClear() {
  if (doc.value && undo.value) restoreItems(doc.value, undo.value.items)
  undo.value = undefined
}

// --- Liste umbenennen / löschen -----------------------------------------------

const renaming = ref<string>()
const confirmDelete = ref(false)

function saveRename() {
  if (doc.value && renaming.value?.trim()) renameList(doc.value, props.listId, renaming.value)
  renaming.value = undefined
}

async function removeList() {
  if (doc.value) deleteList(doc.value, props.listId)
  confirmDelete.value = false
  await router.replace({ name: 'home' })
}

const detail = (i: Item) => [i.quantity, i.unit].filter(Boolean).join(' ')
/** Herkunft aus Rezepten, z. B. „für: Pizza, Zwiebelkuchen“. */
const origin = (i: Item) => {
  const labels = [...new Set((i.sources ?? []).map((s) => s.label).filter(Boolean))]
  return labels.length ? `für: ${labels.join(', ')}` : undefined
}
</script>

<template>
  <p><RouterLink :to="{ name: 'home' }">← Alle Listen</RouterLink></p>
  <p v-if="error" role="alert">{{ error }}</p>
  <template v-else-if="doc && !list">
    <h1>Liste nicht gefunden</h1>
    <p>Vielleicht wurde sie auf einem anderen Gerät gelöscht.</p>
  </template>
  <template v-else-if="list">
    <div class="title">
      <h1>{{ list.name }}</h1>
      <AppButton variant="ghost" @click="renaming = list.name">Umbenennen</AppButton>
    </div>

    <p v-if="readOnly" class="notice" role="status">
      Du siehst den aktuellen Stand. Damit die anderen deine Änderungen sehen, melde dich an – bis
      dahin bleiben sie auf diesem Gerät.
      <ConnectButton />
    </p>

    <form class="add" aria-label="Eintrag hinzufügen" @submit.prevent="add">
      <AppTextField
        v-model="name"
        class="add__name"
        label="Was fehlt?"
        :list="datalistId"
        autocomplete="off"
        enterkeyhint="done"
        maxlength="100"
      />
      <AppTextField
        v-model="quantity"
        class="add__qty"
        label="Menge"
        inputmode="decimal"
        maxlength="20"
      />
      <AppTextField v-model="unit" class="add__unit" label="Einheit" maxlength="20" />
      <AppButton type="submit" variant="primary" :disabled="!name.trim()">Hinzufügen</AppButton>
      <datalist :id="datalistId">
        <option v-for="s in suggestions" :key="s" :value="s" />
      </datalist>
    </form>

    <div v-if="stores.length" class="field store">
      <label for="list-store">Sortiert für</label>
      <select id="list-store" :value="list.storeId ?? ''" @change="chooseStore">
        <option value="">Standard-Reihenfolge</option>
        <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </div>
    <p v-else class="muted">
      Tipp: Unter
      <RouterLink :to="{ name: 'space', params: { spaceId } }">Mitglieder & Einladen</RouterLink>
      legst du Läden mit eigener Reihenfolge an.
    </p>

    <p v-if="items.length === 0" class="muted">Die Liste ist leer.</p>
    <section v-for="group in groups" :key="group.category" class="group">
      <h2>{{ categoryName(group.category) }}</h2>
      <ul>
        <AppListItem
          v-for="item in group.items"
          :key="item.id"
          :label="item.note ? `${item.name} – ${item.note}` : item.name"
          :detail="detail(item)"
          :hint="origin(item)"
          :done="item.checked"
          @update:done="(v: boolean) => doc && setChecked(doc, item.id, v)"
        >
          <template #actions>
            <AppButton variant="ghost" @click="edit(item)">
              Ändern<span class="visually-hidden">: {{ item.name }}</span>
            </AppButton>
          </template>
        </AppListItem>
      </ul>
    </section>

    <div class="footer">
      <AppButton :disabled="!hasChecked" @click="clearChecked">Erledigte entfernen</AppButton>
      <AppButton v-if="kind !== 'shared-list'" @click="confirmShare = true">
        Mit anderen teilen
      </AppButton>
      <AppButton variant="danger" @click="confirmDelete = true">Liste löschen</AppButton>
    </div>
  </template>

  <AppDialog
    :open="!!duplicate"
    title="Schon auf der Liste"
    @update:open="(v) => !v && (duplicate = undefined)"
  >
    <p v-if="duplicate">
      „{{ duplicate.existing.name }}“ steht schon auf der Liste. Zusammenführen?
    </p>
    <template #actions>
      <AppButton @click="duplicate = undefined">Beide behalten</AppButton>
      <AppButton variant="primary" @click="mergeDuplicate">Zusammenführen</AppButton>
    </template>
  </AppDialog>

  <AppDialog
    :open="!!editing"
    title="Eintrag ändern"
    @update:open="(v) => !v && (editing = undefined)"
  >
    <form v-if="editing" id="edit-form" class="stack" @submit.prevent="saveEdit">
      <AppTextField v-model="editing.name" label="Name" maxlength="100" />
      <div class="row">
        <AppTextField v-model="editing.quantity" label="Menge" maxlength="20" />
        <AppTextField v-model="editing.unit" label="Einheit" maxlength="20" />
      </div>
      <AppTextField v-model="editing.note" label="Notiz" maxlength="200" />
      <div class="field">
        <label for="edit-category">Kategorie</label>
        <select id="edit-category" v-model="editing.category">
          <option v-for="c in CATEGORIES" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <small class="muted">Der Haushalt merkt sich die Zuordnung für diesen Artikel.</small>
      </div>
    </form>
    <template #actions>
      <AppButton variant="danger" @click="deleteEditing">Löschen</AppButton>
      <AppButton @click="editing = undefined">Abbrechen</AppButton>
      <AppButton type="submit" form="edit-form" variant="primary">Speichern</AppButton>
    </template>
  </AppDialog>

  <AppDialog
    :open="renaming !== undefined"
    title="Liste umbenennen"
    @update:open="(v) => !v && (renaming = undefined)"
  >
    <form v-if="renaming !== undefined" id="rename-form" @submit.prevent="saveRename">
      <AppTextField v-model="renaming" label="Name" maxlength="80" />
    </form>
    <template #actions>
      <AppButton @click="renaming = undefined">Abbrechen</AppButton>
      <AppButton type="submit" form="rename-form" variant="primary">Speichern</AppButton>
    </template>
  </AppDialog>

  <AppDialog v-model:open="confirmShare" title="Liste mit anderen teilen?">
    <p>
      Die Liste bekommt einen eigenen Bereich mit eigenem Schlüssel. Alle Geräte in diesem Bereich
      sehen sie weiterhin; zusätzlich kannst du Freunde einladen, die nur diese Liste sehen.
    </p>
    <p v-if="shareError" role="alert" class="error">{{ shareError }}</p>
    <template #actions>
      <AppButton @click="confirmShare = false">Abbrechen</AppButton>
      <AppButton variant="primary" @click="share">Teilen</AppButton>
    </template>
  </AppDialog>

  <AppDialog v-model:open="confirmDelete" title="Liste löschen?">
    <p>Die Liste wird mit allen Einträgen auf allen Geräten gelöscht.</p>
    <template #actions>
      <AppButton @click="confirmDelete = false">Abbrechen</AppButton>
      <AppButton variant="danger" @click="removeList">Löschen</AppButton>
    </template>
  </AppDialog>

  <AppToast v-if="undo" :duration="8000" @dismiss="undo = undefined">
    {{ undo.text }}
    <template #actions>
      <AppButton variant="ghost" @click="undoClear">Rückgängig</AppButton>
    </template>
  </AppToast>
</template>

<style scoped>
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.title h1 {
  margin: 0;
}
.add {
  display: grid;
  grid-template-columns: 1fr 5rem 6rem auto;
  align-items: end;
  gap: var(--space-2);
  margin: var(--space-4) 0 var(--space-6);
}
@media (max-width: 36rem) {
  .add {
    grid-template-columns: 1fr 1fr;
  }
  .add__name {
    grid-column: 1 / -1;
  }
}
.group h2 {
  font-size: var(--font-size-md);
  color: var(--text-muted);
  margin: var(--space-6) 0 var(--space-2);
}
.group ul {
  margin: 0;
  padding: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: var(--space-8);
}
.muted {
  color: var(--text-muted);
}
.store {
  max-width: 20rem;
}
.notice {
  padding: var(--space-3);
  border-left: 4px solid var(--warning);
  background: var(--surface);
}
.error {
  color: var(--error);
}
.stack {
  display: grid;
  gap: var(--space-4);
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}
.field {
  display: grid;
  gap: var(--space-1);
}
.field label {
  font-weight: 600;
}
select {
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
</style>
