<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { type Meal, type PlanEntry, type RecipeEntry, normalizeName } from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppTextField from '@/ui/components/AppTextField.vue'

/**
 * Planeintrag anlegen oder ändern (plan/05-phase-3-planung.md, 3.1, 3.2).
 * Datum und Mahlzeit lassen sich hier auch ändern – das ist das Verschieben
 * für Geräte ohne Drag & Drop.
 */
export interface PlanEntryForm {
  recipeKey?: string
  title: string
  servings?: number
  note: string
  /** Leer: Ideen-Pool. */
  date: string
  meal: string
}

const props = defineProps<{
  /** Vorhandener Eintrag; sonst wird ein neuer angelegt. */
  entry?: PlanEntry | undefined
  initial: { date: string; meal: string; recipeKey?: string; servings?: number }
  meals: Meal[]
  recipes: RecipeEntry[]
  /** Anzeigename eines Rezepts (mit Bereich bzw. „Katalog“). */
  recipeLabel: (entry: RecipeEntry) => string
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  save: [form: PlanEntryForm]
  remove: []
  cooked: []
  reopen: []
}>()

const search = ref('')
const recipeKey = ref<string>('')
const title = ref('')
const servings = ref('')
const note = ref('')
const date = ref('')
const meal = ref('')

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const e = props.entry
    search.value = ''
    recipeKey.value = e?.recipeKey ?? props.initial.recipeKey ?? ''
    title.value = e?.title ?? ''
    const s = e ? e.servings : props.initial.servings
    servings.value = s ? String(s).replace('.', ',') : ''
    note.value = e?.note ?? ''
    date.value = e ? (e.date ?? '') : props.initial.date
    meal.value = e?.meal ?? props.initial.meal
  },
  { immediate: true },
)

const selected = computed(() => props.recipes.find((r) => r.key === recipeKey.value))
const filtered = computed(() => {
  const q = normalizeName(search.value)
  const list = q
    ? props.recipes.filter((r) => normalizeName(props.recipeLabel(r)).includes(q))
    : props.recipes
  const top = list.slice(0, 50)
  // Das gewählte Rezept bleibt sichtbar, auch wenn es nicht zur Suche passt.
  if (selected.value && !top.includes(selected.value)) top.unshift(selected.value)
  return top
})

function chooseRecipe() {
  const r = selected.value
  if (!r) return
  if (!props.entry || !title.value) title.value = r.recipe.meta.title
  if (!servings.value && r.recipe.meta.servings) servings.value = String(r.recipe.meta.servings)
}

const servingsNumber = computed(() => {
  const n = Number(servings.value.replace(',', '.'))
  return servings.value.trim() && Number.isFinite(n) && n > 0 ? n : undefined
})
const titleValue = computed(() => title.value.trim() || selected.value?.recipe.meta.title || '')
const valid = computed(
  () => !!titleValue.value && (!servings.value.trim() || servingsNumber.value !== undefined),
)

function submit() {
  if (!valid.value) return
  const form: PlanEntryForm = {
    title: titleValue.value,
    note: note.value,
    date: date.value,
    meal: meal.value,
  }
  if (recipeKey.value) form.recipeKey = recipeKey.value
  if (servingsNumber.value !== undefined) form.servings = servingsNumber.value
  emit('save', form)
}
const formId = useId()
</script>

<template>
  <AppDialog v-model:open="open" :title="entry ? 'Planeintrag' : 'Einplanen'">
    <form v-if="open" :id="formId" class="stack" @submit.prevent="submit">
      <template v-if="!entry || !entry.recipeKey">
        <AppTextField v-model="search" label="Rezept suchen" type="search" autocomplete="off" />
        <div class="field">
          <label :for="`${formId}-recipe`">Rezept</label>
          <select :id="`${formId}-recipe`" v-model="recipeKey" size="6" @change="chooseRecipe">
            <option value="">– ohne Rezept –</option>
            <option v-for="r in filtered" :key="r.key" :value="r.key">
              {{ recipeLabel(r) }}
            </option>
          </select>
        </div>
      </template>
      <AppTextField
        v-model="title"
        label="Titel"
        :hint="selected ? undefined : 'Ohne Rezept, z. B. „Reste“ oder „Essen gehen“.'"
        maxlength="120"
      />
      <div class="row">
        <AppTextField v-model="servings" label="Portionen" inputmode="decimal" maxlength="6" />
        <div class="field">
          <label :for="`${formId}-meal`">Mahlzeit</label>
          <select :id="`${formId}-meal`" v-model="meal">
            <option v-for="m in meals" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
      </div>
      <AppTextField v-model="date" label="Tag" type="date" hint="Leer lassen für den Ideen-Pool." />
      <AppTextField v-model="note" label="Notiz" maxlength="500" />
    </form>
    <template #actions>
      <template v-if="entry">
        <AppButton variant="danger" @click="emit('remove')">Entfernen</AppButton>
        <AppButton v-if="entry.status === 'planned'" @click="emit('cooked')">Gekocht</AppButton>
        <AppButton v-else @click="emit('reopen')">Doch nicht gekocht</AppButton>
      </template>
      <AppButton @click="open = false">Abbrechen</AppButton>
      <AppButton type="submit" :form="formId" variant="primary" :disabled="!valid">
        {{ entry ? 'Speichern' : 'Einplanen' }}
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
select[size] {
  padding: var(--space-1);
}
</style>
