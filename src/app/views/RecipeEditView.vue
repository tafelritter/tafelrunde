<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  type MetaField,
  checkReferences,
  ingredientSnippet,
  parseRecipe,
  readFrontMatter,
  recipeText,
  setFrontMatter,
  timerSnippet,
  touchRecipe,
  updateRecipeSource,
} from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import AppCheckbox from '@/ui/components/AppCheckbox.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import CooklangEditor from '@/ui/components/CooklangEditor.vue'
import { catalogNames } from '../catalog'
import { recipeKey, useRecipes } from '../recipes/recipe-store'
import RecipeView from './RecipeView.vue'

const props = defineProps<{ spaceId: string; recipeId: string }>()
const router = useRouter()
const { index, handles } = useRecipes()

const library = computed(() => handles.value.find((h) => h.record.id === props.spaceId)?.library)
const text = computed(() =>
  library.value ? recipeText(library.value.doc, props.recipeId) : undefined,
)
const editor = shallowRef<InstanceType<typeof CooklangEditor>>()

// Quelltext und Auswertung folgen dem Editor (auch Änderungen anderer Geräte).
const source = ref('')
watch(text, (t) => (source.value = t?.toJSON() ?? ''), { immediate: true })
function onChange() {
  source.value = text.value?.toJSON() ?? ''
}
const parsed = computed(() => parseRecipe(source.value))
const key = computed(() => recipeKey(props.spaceId, props.recipeId))
const check = computed(() =>
  checkReferences(index.value, { key: key.value, scope: props.spaceId, recipe: parsed.value }),
)
const previewEntry = computed(() => ({
  key: key.value,
  scope: props.spaceId,
  recipe: parsed.value,
}))
const showPreview = ref(false)

// --- Einfügehilfen --------------------------------------------------------------

const dialog = ref<'ingredient' | 'reference' | 'timer' | 'meta'>()
const ing = ref({ name: '', quantity: '', unit: '', note: '', fixed: false, optional: false })
const ref_ = ref({ title: '', quantity: '', unit: '' })
const timer = ref({ minutes: '10', name: '' })
const datalistId = useId()

const otherRecipes = computed(() =>
  index.value.entries
    .filter((e) => e.key !== key.value && e.recipe.meta.title)
    .map((e) => ({ key: e.key, title: e.recipe.meta.title, catalog: e.scope === 'catalog' })),
)

function open(which: NonNullable<typeof dialog.value>) {
  if (which === 'ingredient')
    ing.value = { name: '', quantity: '', unit: '', note: '', fixed: false, optional: false }
  if (which === 'reference')
    ref_.value = { title: otherRecipes.value[0]?.title ?? '', quantity: '', unit: '' }
  if (which === 'meta') meta.value = { ...EMPTY_META, ...readFrontMatter(source.value) }
  dialog.value = which
}

function insertIngredient() {
  if (!ing.value.name.trim()) return
  editor.value?.insert(ingredientSnippet(ing.value))
  dialog.value = undefined
}

function insertReference() {
  if (!ref_.value.title) return
  editor.value?.insert(
    ingredientSnippet({ ...ref_.value, name: ref_.value.title, reference: true }),
  )
  dialog.value = undefined
}

function insertTimer() {
  const minutes = Number(timer.value.minutes.replace(',', '.'))
  if (!(minutes > 0)) return
  editor.value?.insert(timerSnippet(minutes, timer.value.name))
  dialog.value = undefined
}

// --- Metadaten ------------------------------------------------------------------

const EMPTY_META: Record<MetaField, string> = {
  title: '',
  servings: '',
  yield: '',
  tags: '',
  'time.prep': '',
  'time.cook': '',
  source: '',
  description: '',
  diet: '',
}
const meta = ref<Record<MetaField, string>>({ ...EMPTY_META })

function saveMeta() {
  if (!library.value) return
  const m = meta.value
  const next = setFrontMatter(source.value, {
    ...m,
    tags: m.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  })
  updateRecipeSource(library.value.doc, props.recipeId, next)
  onChange()
  dialog.value = undefined
}

// --- Fertig ---------------------------------------------------------------------

const error = ref<string>()
async function done() {
  error.value = undefined
  if (check.value.cycle) {
    error.value = `Diese Rezepte verweisen im Kreis aufeinander: ${check.value.cycle.join(' → ')}. Bitte eine Referenz entfernen.`
    return
  }
  if (library.value) touchRecipe(library.value.doc, props.recipeId)
  await router.push({
    name: 'recipe',
    params: { spaceId: props.spaceId, recipeId: props.recipeId },
  })
}
</script>

<template>
  <p>
    <RouterLink :to="{ name: 'recipe', params: { spaceId, recipeId } }">← Zum Rezept</RouterLink>
  </p>
  <h1>{{ parsed.meta.title || 'Rezept' }} bearbeiten</h1>
  <template v-if="text">
    <div class="toolbar" role="toolbar" aria-label="Einfügen">
      <AppButton @click="open('ingredient')">Zutat einfügen</AppButton>
      <AppButton @click="open('reference')">Rezept referenzieren</AppButton>
      <AppButton @click="open('timer')">Timer einfügen</AppButton>
      <AppButton @click="open('meta')">Titel, Portionen, Zeiten …</AppButton>
      <AppButton variant="ghost" :aria-pressed="showPreview" @click="showPreview = !showPreview">
        Vorschau
      </AppButton>
    </div>

    <div :class="['edit', { 'edit--preview': showPreview }]">
      <CooklangEditor
        ref="editor"
        :text="text"
        label="Rezepttext in Cooklang"
        :unresolved="check.unresolved"
        @change="onChange"
      />
      <section v-if="showPreview" class="preview" aria-label="Vorschau">
        <RecipeView :entry="previewEntry" />
      </section>
    </div>

    <ul class="problems" aria-live="polite">
      <li v-for="w in parsed.warnings" :key="w" class="warning">{{ w }}</li>
      <li v-for="r in check.unresolved" :key="r" class="error">
        Rezept „{{ r }}“ nicht gefunden (im Text unterstrichen).
      </li>
      <li v-if="check.cycle" class="error">Zyklus: {{ check.cycle.join(' → ') }}</li>
    </ul>
    <p class="muted">
      Änderungen werden sofort gespeichert und mit den anderen Geräten abgeglichen.
      <a href="https://cooklang.org/docs/spec/" rel="noopener noreferrer" target="_blank"
        >Cooklang-Schreibweise</a
      >
    </p>
    <AppButton variant="primary" @click="done">Fertig</AppButton>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </template>
  <p v-else-if="handles.length">Rezept nicht gefunden.</p>

  <AppDialog
    :open="dialog === 'ingredient'"
    title="Zutat einfügen"
    @update:open="(v: boolean) => !v && (dialog = undefined)"
  >
    <form id="ing-form" class="stack" @submit.prevent="insertIngredient">
      <AppTextField
        v-model="ing.name"
        label="Zutat"
        :list="datalistId"
        autocomplete="off"
        maxlength="60"
      />
      <datalist :id="datalistId">
        <option v-for="n in catalogNames()" :key="n" :value="n" />
      </datalist>
      <div class="row">
        <AppTextField v-model="ing.quantity" label="Menge" inputmode="decimal" maxlength="12" />
        <AppTextField v-model="ing.unit" label="Einheit" maxlength="20" />
      </div>
      <AppTextField
        v-model="ing.note"
        label="Zubereitung (optional)"
        hint="z. B. gewürfelt"
        maxlength="60"
      />
      <AppCheckbox v-model="ing.fixed" label="Menge nicht mitskalieren (z. B. eine Prise)" />
      <AppCheckbox v-model="ing.optional" label="Optional" />
    </form>
    <template #actions>
      <AppButton @click="dialog = undefined">Abbrechen</AppButton>
      <AppButton type="submit" form="ing-form" variant="primary">Einfügen</AppButton>
    </template>
  </AppDialog>

  <AppDialog
    :open="dialog === 'reference'"
    title="Rezept referenzieren"
    @update:open="(v: boolean) => !v && (dialog = undefined)"
  >
    <form id="ref-form" class="stack" @submit.prevent="insertReference">
      <div class="field">
        <label for="ref-recipe">Rezept</label>
        <select id="ref-recipe" v-model="ref_.title">
          <option v-for="r in otherRecipes" :key="r.key" :value="r.title">
            {{ r.title }}{{ r.catalog ? ' (Katalog)' : '' }}
          </option>
        </select>
      </div>
      <div class="row">
        <AppTextField v-model="ref_.quantity" label="Menge" inputmode="decimal" maxlength="12" />
        <AppTextField
          v-model="ref_.unit"
          label="Einheit"
          hint="z. B. g oder leer für Portionen"
          maxlength="20"
        />
      </div>
      <p v-if="!otherRecipes.length" class="muted">Es gibt noch keine anderen Rezepte.</p>
    </form>
    <template #actions>
      <AppButton @click="dialog = undefined">Abbrechen</AppButton>
      <AppButton type="submit" form="ref-form" variant="primary" :disabled="!otherRecipes.length"
        >Einfügen</AppButton
      >
    </template>
  </AppDialog>

  <AppDialog
    :open="dialog === 'timer'"
    title="Timer einfügen"
    @update:open="(v: boolean) => !v && (dialog = undefined)"
  >
    <form id="timer-form" class="stack" @submit.prevent="insertTimer">
      <AppTextField v-model="timer.minutes" label="Minuten" inputmode="decimal" maxlength="6" />
      <AppTextField
        v-model="timer.name"
        label="Name (optional)"
        hint="z. B. Teig ruhen"
        maxlength="40"
      />
    </form>
    <template #actions>
      <AppButton @click="dialog = undefined">Abbrechen</AppButton>
      <AppButton type="submit" form="timer-form" variant="primary">Einfügen</AppButton>
    </template>
  </AppDialog>

  <AppDialog
    :open="dialog === 'meta'"
    title="Titel, Portionen, Zeiten"
    @update:open="(v: boolean) => !v && (dialog = undefined)"
  >
    <form id="meta-form" class="stack" @submit.prevent="saveMeta">
      <AppTextField v-model="meta.title" label="Titel" maxlength="100" />
      <div class="row">
        <AppTextField
          v-model="meta.servings"
          label="Portionen"
          inputmode="decimal"
          maxlength="10"
        />
        <AppTextField
          v-model="meta.yield"
          label="Ausbeute"
          hint="z. B. 800 g – für Unterrezepte"
          maxlength="20"
        />
      </div>
      <div class="row">
        <AppTextField
          v-model="meta['time.prep']"
          label="Vorbereitung"
          hint="z. B. 20 min"
          maxlength="20"
        />
        <AppTextField
          v-model="meta['time.cook']"
          label="Koch-/Backzeit"
          hint="z. B. 1 h"
          maxlength="20"
        />
      </div>
      <AppTextField v-model="meta.tags" label="Tags" hint="mit Komma getrennt" maxlength="200" />
      <AppTextField v-model="meta.source" label="Quelle" maxlength="300" />
      <AppTextField v-model="meta.description" label="Kurzbeschreibung" maxlength="300" />
      <div class="field">
        <label for="meta-diet">Ernährungsform</label>
        <select id="meta-diet" v-model="meta.diet">
          <option value="">automatisch aus den Zutaten</option>
          <option value="vegan">vegan</option>
          <option value="vegetarisch">vegetarisch</option>
          <option value="pescetarisch">mit Fisch</option>
          <option value="omnivor">mit Fleisch</option>
        </select>
      </div>
    </form>
    <template #actions>
      <AppButton @click="dialog = undefined">Abbrechen</AppButton>
      <AppButton type="submit" form="meta-form" variant="primary">Übernehmen</AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.edit {
  display: grid;
  gap: var(--space-4);
}
@media (min-width: 64rem) {
  .edit--preview {
    grid-template-columns: 1fr 1fr;
  }
}
.preview {
  padding: var(--space-4);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}
.problems {
  margin: var(--space-3) 0;
  padding-left: var(--space-6);
}
.warning {
  color: var(--warning);
}
.error {
  color: var(--error);
}
.muted {
  color: var(--text-muted);
}
.stack {
  display: grid;
  gap: var(--space-3);
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
