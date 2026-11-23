<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  type ShoppingLine,
  type ShoppingRequest,
  type SubRecipeMode,
  addLinesToList,
  buildShoppingLines,
  createList,
  findSubRecipes,
  getLists,
  isPantryItem,
  quantityFromSources,
} from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import { catalogItem } from '../catalog'
import { planSpaces } from '../plan/plan-helpers'
import { useRecipes } from '../recipes/recipe-store'
import { useDocVersion, workspace } from '../workspace/use-workspace'

/**
 * Vorschau vor dem Übernehmen auf eine Einkaufsliste (plan/05-phase-3-planung.md,
 * 3.3–3.6): Einträge abwählen, Mengen anpassen, Unterrezepte und Grundvorräte klären.
 */
const props = defineProps<{
  requests: ShoppingRequest[]
  /** Fester Bereich (aus dem Plan: Einträge bleiben mit dem Plan verbunden). */
  spaceId?: string | undefined
  title?: string
}>()
const open = defineModel<boolean>('open', { default: false })
const router = useRouter()
const { index, handles } = useRecipes()

const spaces = computed(() => planSpaces(handles.value))
const chosenSpace = ref<string>()
const targetSpace = computed(() => props.spaceId ?? chosenSpace.value ?? spaces.value[0]?.id)
const handle = computed(() => handles.value.find((h) => h.record.id === targetSpace.value))
const doc = computed(() => handle.value?.doc)
const version = useDocVersion(doc)

const NEW = '__neu__'
const lists = computed(() => (version.value, doc.value ? getLists(doc.value) : []))
const listChoice = ref<string>()
const listId = computed({
  get: () =>
    lists.value.some((l) => l.id === listChoice.value) || listChoice.value === NEW
      ? listChoice.value!
      : (lists.value[0]?.id ?? NEW),
  set: (v: string) => (listChoice.value = v),
})
const newListName = ref('Einkauf')

// --- Unterrezepte (3.5) -------------------------------------------------------

const modes = reactive(new Map<string, SubRecipeMode>())
const subRecipes = computed(() => findSubRecipes(index.value, props.requests, modes))

// --- Zeilen -------------------------------------------------------------------------

const lines = computed<ShoppingLine[]>(() => {
  void version.value
  const d = doc.value
  return buildShoppingLines(index.value, props.requests, {
    modes,
    catalog: (name) => catalogItem(name),
    isPantry: (name, id) => (d ? isPantryItem(d, name, id) : false),
  })
})

interface LineState {
  selected: boolean
  quantity: string
  unit: string
  /** Zuletzt berechnete Menge – um Änderungen von Hand zu erkennen. */
  computedQuantity: string
}
const state = reactive(new Map<string, LineState>())
watch(
  lines,
  (current) => {
    for (const line of current) {
      const q = quantityFromSources(line.sources)
      const prev = state.get(line.key)
      // Berechnete Menge übernehmen, solange niemand sie geändert hat.
      if (!prev) {
        const selected = !line.pantry && !line.optional
        state.set(line.key, { selected, ...q, computedQuantity: q.quantity })
      } else if (prev.quantity === prev.computedQuantity) {
        Object.assign(prev, q, { computedQuantity: q.quantity })
      }
    }
  },
  { immediate: true },
)

const regular = computed(() => lines.value.filter((l) => !l.pantry))
const pantry = computed(() => lines.value.filter((l) => l.pantry))
const lineState = (line: ShoppingLine) => state.get(line.key)!
const selectedCount = computed(() => lines.value.filter((l) => state.get(l.key)?.selected).length)
const origin = (line: ShoppingLine) => line.sources.map((s) => s.label).join(', ')

// --- Übernehmen ---------------------------------------------------------------------

const error = ref<string>()
const deviceId = shallowRef('')
void workspace().then((ws) => (deviceId.value = ws.profile?.deviceId ?? ''))

async function submit() {
  const d = doc.value
  if (!d) return
  error.value = undefined
  try {
    let target = listId.value
    if (target === NEW) target = createList(d, newListName.value || 'Einkauf')
    const chosen = lines.value.flatMap((line) => {
      const s = state.get(line.key)
      if (!s?.selected) return []
      return [{ ...line, quantity: s.quantity, unit: s.unit }]
    })
    addLinesToList(d, target, chosen, deviceId.value, {
      lookupId: (name) => catalogItem(name)?.id,
    })
    open.value = false
    await router.push({ name: 'list', params: { spaceId: targetSpace.value!, listId: target } })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <AppDialog v-model:open="open" :title="title ?? 'Auf die Einkaufsliste'">
    <form v-if="open" id="shopping-preview" class="stack" @submit.prevent="submit">
      <div class="row">
        <div v-if="!spaceId && spaces.length > 1" class="field">
          <label for="preview-space">Bereich</label>
          <select id="preview-space" v-model="chosenSpace" @change="listChoice = undefined">
            <option v-for="s in spaces" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="preview-list">Liste</label>
          <select id="preview-list" v-model="listId">
            <option v-for="l in lists" :key="l.id" :value="l.id">{{ l.name }}</option>
            <option :value="NEW">Neue Liste …</option>
          </select>
        </div>
        <AppTextField
          v-if="listId === NEW"
          v-model="newListName"
          label="Name der neuen Liste"
          maxlength="80"
        />
      </div>

      <fieldset v-for="sub in subRecipes" :key="sub.key" class="sub">
        <legend>„{{ sub.title }}“ schon vorhanden?</legend>
        <p class="muted">für: {{ sub.usedBy.join(', ') }}</p>
        <label>
          <input
            type="radio"
            :name="`sub-${sub.key}`"
            :checked="(modes.get(sub.key) ?? 'expand') === 'expand'"
            @change="modes.delete(sub.key)"
          />
          Nein – Zutaten einkaufen
        </label>
        <label>
          <input
            type="radio"
            :name="`sub-${sub.key}`"
            :checked="modes.get(sub.key) === 'omit'"
            @change="modes.set(sub.key, 'omit')"
          />
          Ja – weglassen
        </label>
        <label>
          <input
            type="radio"
            :name="`sub-${sub.key}`"
            :checked="modes.get(sub.key) === 'item'"
            @change="modes.set(sub.key, 'item')"
          />
          Als einen Posten übernehmen
        </label>
      </fieldset>

      <p v-if="!lines.length" class="muted">Keine Zutaten gefunden.</p>
      <table v-else class="lines">
        <caption class="visually-hidden">
          Einträge für die Einkaufsliste
        </caption>
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">Übernehmen</span></th>
            <th scope="col">Artikel</th>
            <th scope="col">Menge</th>
            <th scope="col">Einheit</th>
          </tr>
        </thead>
        <template v-for="group in [regular, pantry]" :key="group === pantry ? 'p' : 'r'">
          <tbody v-if="group.length">
            <tr v-if="group === pantry">
              <th colspan="4" scope="colgroup" class="group">
                Grundvorräte – nur bei Bedarf auswählen
              </th>
            </tr>
            <tr v-for="line in group" :key="line.key">
              <td>
                <input
                  :id="`line-${line.key}`"
                  v-model="lineState(line).selected"
                  type="checkbox"
                />
              </td>
              <td>
                <label :for="`line-${line.key}`">
                  {{ line.name }}
                  <span v-if="line.optional" class="muted">(optional)</span>
                </label>
                <small class="origin">für: {{ origin(line) }}</small>
              </td>
              <td>
                <input
                  v-model="lineState(line).quantity"
                  class="qty"
                  maxlength="40"
                  :aria-label="`Menge ${line.name}`"
                />
              </td>
              <td>
                <input
                  v-model="lineState(line).unit"
                  class="unit"
                  maxlength="20"
                  :aria-label="`Einheit ${line.name}`"
                />
              </td>
            </tr>
          </tbody>
        </template>
      </table>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
    </form>
    <template #actions>
      <AppButton @click="open = false">Abbrechen</AppButton>
      <AppButton
        type="submit"
        form="shopping-preview"
        variant="primary"
        :disabled="!selectedCount || !doc"
      >
        {{ selectedCount }} übernehmen
      </AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.stack {
  display: grid;
  gap: var(--space-4);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: end;
}
.field {
  display: grid;
  gap: var(--space-1);
}
.field label {
  font-weight: 600;
}
select,
.lines input:not([type='checkbox']) {
  min-height: var(--touch-target);
  padding: 0 var(--space-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.sub {
  display: grid;
  gap: var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}
.sub legend {
  font-weight: 600;
}
.sub p {
  margin: 0;
}
.lines {
  width: 100%;
  border-collapse: collapse;
}
.lines th,
.lines td {
  padding: var(--space-1);
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--border);
}
.lines input[type='checkbox'] {
  width: 1.375rem;
  height: 1.375rem;
  margin-top: var(--space-2);
  accent-color: var(--primary);
}
.lines .qty {
  width: 6rem;
}
.lines .unit {
  width: 4.5rem;
}
.group {
  padding-top: var(--space-4);
  color: var(--text-muted);
}
.origin {
  display: block;
  color: var(--text-muted);
}
.muted {
  color: var(--text-muted);
}
.error {
  color: var(--error);
}
</style>
