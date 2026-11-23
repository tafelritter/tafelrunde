<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  type Block,
  type RecipeEntry,
  type ResolvedReference,
  DIET_LABELS,
  addPlanEntry,
  deleteRecipe,
  getMeals,
  toPlanDate,
  formatAmount,
  formatNumber,
  lastCooked,
  listIngredients,
  logCooked,
  recipeDiet,
  resolveAll,
  scaleRecipe,
  safeFileName,
  spaceKind,
  spaceName,
  spaceOwner,
  subRecipeIngredients,
  timerSeconds,
} from '@/core'
import { downloadFile } from '../download'
import { catalogSources } from '../recipes/catalog-recipes'
import AppButton from '@/ui/components/AppButton.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import AppToast from '@/ui/components/AppToast.vue'
import TimerButton from '@/ui/components/TimerButton.vue'
import { catalogDiet } from '../catalog'
import { useRecipes } from '../recipes/recipe-store'
import { recipeRoute } from '../recipes/routes'
import { catalogVersions, loadCatalogRecipes } from '../recipes/catalog-recipes'
import { bumpWorkspace, workspace } from '../workspace/use-workspace'
import { planSpaces, recipeRequest } from '../plan/plan-helpers'
import CookMode from './CookMode.vue'
import ShoppingPreview from './ShoppingPreview.vue'
import RecipeCollections from './RecipeCollections.vue'
import RecipePhotos from './RecipePhotos.vue'
import RecipeNutrition from './RecipeNutrition.vue'
import RecipeReviews from './RecipeReviews.vue'
import { loadNutrition, nutritionOf } from '../nutrition'

/**
 * Rezeptansicht. Kann auch ein Katalogrezept zeigen (`entry` gesetzt, ohne Bereich).
 * Alle Texte aus dem Rezept werden als Text gerendert, nie als HTML.
 */
const props = defineProps<{
  spaceId?: string
  recipeId?: string
  entry?: RecipeEntry
  /** Foto eines Katalogrezepts (statische Datei der App). */
  imageUrl?: string | undefined
}>()
const router = useRouter()
const route = useRoute()
const { recipes, index, handles } = useRecipes()
// Für Referenzen auf Katalogrezepte und den Hinweis „Original geändert“.
void loadCatalogRecipes()
void loadNutrition()

const current = computed<RecipeEntry | undefined>(
  () =>
    props.entry ??
    recipes.value.find((r) => r.spaceId === props.spaceId && r.id === props.recipeId),
)
const base = computed(() => current.value?.recipe)
/** Übernommenes Rezept, dessen Original im Katalog sich seitdem geändert hat (2.11). */
const origin = computed(() => {
  const stored = recipes.value.find(
    (r) => r.spaceId === props.spaceId && r.id === props.recipeId,
  )?.stored
  return stored?.origin
})
const originChanged = computed(() => {
  const o = origin.value
  if (o?.kind !== 'catalog') return false
  const now = catalogVersions.value.get(o.ref)
  return now !== undefined && now !== o.version
})
const scope = computed(() => current.value?.scope ?? '')
const handle = computed(() => handles.value.find((h) => h.record.id === props.spaceId))
const ownPersonId = ref<string>()
void workspace().then((ws) => (ownPersonId.value = ws.profile?.personId))
/** In einer Rezept-Freigabe dürfen nur die Ersteller ändern; Empfänger übernehmen. */
const isReceivedShare = computed(() => {
  const h = handle.value
  return !!h && spaceKind(h.doc) === 'recipe-share' && spaceOwner(h.doc) !== ownPersonId.value
})
const library = computed(() => (isReceivedShare.value ? undefined : handle.value?.library))

// --- Teilen, Übernehmen, Export (2.11, 2.12) -----------------------------------------

const confirmShare = ref(false)
const actionError = ref<string>()
async function share() {
  actionError.value = undefined
  try {
    const target = await (await workspace()).shareRecipe(props.spaceId!, props.recipeId!)
    confirmShare.value = false
    bumpWorkspace()
    await router.push({ name: 'space', params: { spaceId: target.record.id } })
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  }
}

const adoptTargets = computed(() =>
  handles.value
    .filter((h) => spaceKind(h.doc) === 'personal' || spaceKind(h.doc) === 'household')
    .map((h) => ({
      id: h.record.id,
      name: spaceName(h.doc) || (spaceKind(h.doc) === 'personal' ? 'Persönlich' : 'Bereich'),
    })),
)
const adoptTarget = ref<string>()
async function adopt() {
  const to = adoptTarget.value ?? adoptTargets.value[0]?.id
  if (!to || !props.spaceId || !props.recipeId) return
  const id = await (await workspace()).adoptRecipe(props.spaceId, props.recipeId, to)
  await router.push({ name: 'recipe', params: { spaceId: to, recipeId: id } })
}

function exportCook() {
  const stored = recipes.value.find(
    (r) => r.spaceId === props.spaceId && r.id === props.recipeId,
  )?.stored
  const source =
    stored?.source ?? (props.entry ? catalogSources.value.get(props.entry.path ?? '') : undefined)
  if (source === undefined || !base.value) return
  downloadFile(`${safeFileName(base.value.meta.title)}.cook`, source, 'text/plain;charset=utf-8')
}

// --- Portionen ----------------------------------------------------------------

const servings = ref<number>()
watch(
  () => base.value?.meta.servings,
  (s) => {
    // Aus dem Wochenplan („Heute kochen“) mit den geplanten Portionen.
    const planned = Number(route.query.portionen)
    servings.value = s && Number.isFinite(planned) && planned > 0 ? planned : s
  },
  { immediate: true },
)
const factor = computed(() =>
  base.value?.meta.servings && servings.value ? servings.value / base.value.meta.servings : 1,
)
const recipe = computed(() => (base.value ? scaleRecipe(base.value, factor.value) : undefined))
function changeServings(delta: number) {
  if (!servings.value) return
  servings.value = Math.max(1, servings.value + delta)
}

// --- Abgeleitetes ---------------------------------------------------------------

const references = computed(() =>
  recipe.value ? resolveAll(index.value, recipe.value, scope.value) : [],
)
const referenceByIngredient = computed(() => {
  const map = new Map<number, ResolvedReference>()
  for (const r of references.value) map.set(r.ingredient, r)
  return map
})
const ingredientList = computed(() => (recipe.value ? listIngredients(recipe.value) : []))
/** Nährwerte für die gewählten Portionen, inklusive Unterrezepten (4.7, 4.8). */
const nutrition = computed(() =>
  base.value ? nutritionOf(index.value, base.value, scope.value, factor.value) : undefined,
)
const diet = computed(() =>
  base.value ? recipeDiet(index.value, base.value, scope.value, catalogDiet) : undefined,
)
const totalMinutes = computed(
  () => (base.value?.meta.prepMinutes ?? 0) + (base.value?.meta.cookMinutes ?? 0),
)

/** Referenz zur n-ten Zeile der Zutatenliste (gleicher Name und Verweis). */
function referenceForListed(name: string, reference: string | undefined) {
  if (!reference || !recipe.value) return undefined
  const n = recipe.value.ingredients.findIndex((i) => i.name === name && i.reference === reference)
  return referenceByIngredient.value.get(n)
}

/** Quelle nur als Link, wenn es eine http(s)-Adresse ist. */
const sourceUrl = computed(() => {
  const s = base.value?.meta.source
  if (!s) return undefined
  try {
    const url = new URL(s)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
})

// --- Aktionen -----------------------------------------------------------------

const cooking = ref(route.query.kochen === '1')

// --- Planen und Einkaufen (3.2, 3.3) --------------------------------------------------

const planTargets = computed(() => planSpaces(handles.value))
const planOpen = ref(false)
const planSpace = ref<string>()
const planDate = ref('')
const planMeal = ref('')
const planHandle = computed(() =>
  handles.value.find((h) => h.record.id === (planSpace.value ?? planTargets.value[0]?.id)),
)
const planMeals = computed(() => (planHandle.value ? getMeals(planHandle.value.doc) : []))
const toast = ref<string>()
function openPlan() {
  planDate.value = toPlanDate(new Date())
  planMeal.value = ''
  planOpen.value = true
}
async function plan() {
  const h = planHandle.value
  const ws = await workspace()
  if (!h || !current.value || !base.value || !ws.profile) return
  const input: Parameters<typeof addPlanEntry>[1] = {
    title: base.value.meta.title || 'Rezept',
    recipeKey: current.value.key,
    meal: planMeal.value || planMeals.value[0]?.id || 'abend',
  }
  if (planDate.value) input.date = planDate.value
  if (servings.value) input.servings = servings.value
  addPlanEntry(h.doc, input, ws.profile.personId)
  planOpen.value = false
  toast.value = planDate.value
    ? `Eingeplant am ${new Date(`${planDate.value}T12:00:00`).toLocaleDateString('de-DE')}.`
    : 'In den Ideen-Pool gelegt.'
}

const shoppingOpen = ref(false)
const shoppingRequests = computed(() =>
  recipe.value && base.value ? [recipeRequest(base.value, scope.value, servings.value)] : [],
)
const confirmDelete = ref(false)
const cookedAt = shallowRef<number>()
watch(
  [library, () => props.recipeId],
  () => {
    cookedAt.value =
      library.value && props.recipeId ? lastCooked(library.value.doc, props.recipeId) : undefined
  },
  { immediate: true },
)

async function markCooked() {
  const ws = await workspace()
  if (!library.value || !props.recipeId || !ws.profile) return
  logCooked(library.value.doc, props.recipeId, ws.profile.personId)
  cookedAt.value = lastCooked(library.value.doc, props.recipeId)
}

async function remove() {
  if (library.value && props.recipeId) deleteRecipe(library.value.doc, props.recipeId)
  confirmDelete.value = false
  await router.replace({ name: 'recipes' })
}

const stepBlocks = (blocks: Block[]) => blocks
</script>

<template>
  <p><RouterLink :to="{ name: 'recipes' }">← Alle Rezepte</RouterLink></p>
  <template v-if="recipe && base">
    <h1>{{ base.meta.title || 'Ohne Titel' }}</h1>
    <p v-if="base.meta.description" class="lead">{{ base.meta.description }}</p>
    <RecipePhotos
      v-if="handle && props.recipeId"
      :space-id="props.spaceId!"
      :recipe-id="props.recipeId"
      :title="base.meta.title"
      :editable="!!library"
    />
    <img
      v-else-if="imageUrl"
      class="catalog-photo"
      :src="imageUrl"
      :alt="base.meta.title"
      loading="lazy"
    />

    <ul class="facts">
      <li v-if="servings">
        <span class="servings">
          <AppButton variant="ghost" :disabled="servings <= 1" @click="changeServings(-1)">
            −<span class="visually-hidden"> eine Portion weniger</span>
          </AppButton>
          <span aria-live="polite">{{ formatNumber(servings) }} Portionen</span>
          <AppButton variant="ghost" @click="changeServings(1)">
            +<span class="visually-hidden"> eine Portion mehr</span>
          </AppButton>
        </span>
      </li>
      <li v-else-if="base.meta.yield">
        ergibt {{ formatNumber(base.meta.yield.value) }} {{ base.meta.yield.unit }}
      </li>
      <li v-if="totalMinutes">
        {{ totalMinutes }} min
        <span v-if="base.meta.prepMinutes && base.meta.cookMinutes" class="muted">
          ({{ base.meta.prepMinutes }} Vorbereitung, {{ base.meta.cookMinutes }} Kochen)
        </span>
      </li>
      <li v-if="diet?.diet">
        {{ DIET_LABELS[diet.diet] }}
        <span v-if="diet.unknown.length" class="muted">
          (unsicher: {{ diet.unknown.join(', ') }} nicht im Katalog)
        </span>
      </li>
      <li v-for="tag in base.meta.tags" :key="tag" class="tag">{{ tag }}</li>
    </ul>

    <p v-if="origin?.kind === 'catalog'" class="origin">
      Übernommen aus dem Katalog:
      <RouterLink :to="{ name: 'catalog-recipe', params: { path: origin.ref.split('/') } }">
        Original ansehen
      </RouterLink>
      <strong v-if="originChanged"> – das Original wurde seitdem geändert.</strong>
    </p>

    <ul v-if="base.warnings.length" class="warnings" aria-label="Hinweise zum Rezepttext">
      <li v-for="w in base.warnings" :key="w">{{ w }}</li>
    </ul>

    <div class="actions">
      <AppButton variant="primary" :disabled="!recipe.sections.length" @click="cooking = true">
        Kochmodus
      </AppButton>
      <AppButton v-if="planTargets.length" @click="openPlan">Einplanen</AppButton>
      <AppButton v-if="planTargets.length" @click="shoppingOpen = true">
        Auf die Einkaufsliste
      </AppButton>
      <template v-if="library">
        <RouterLink
          class="btn-link"
          :to="{
            name: 'recipe-edit',
            params: { spaceId: props.spaceId!, recipeId: props.recipeId! },
          }"
        >
          Bearbeiten
        </RouterLink>
        <AppButton @click="markCooked">Heute gekocht</AppButton>
        <AppButton
          v-if="handle && spaceKind(handle.doc) !== 'recipe-share'"
          @click="confirmShare = true"
        >
          Teilen
        </AppButton>
      </template>
      <form v-if="isReceivedShare" class="adopt" @submit.prevent="adopt">
        <div v-if="adoptTargets.length > 1" class="field">
          <label for="adopt-shared">Übernehmen nach</label>
          <select id="adopt-shared" v-model="adoptTarget">
            <option v-for="t in adoptTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <AppButton type="submit" :disabled="!adoptTargets.length"
          >In meine Rezepte übernehmen</AppButton
        >
      </form>
      <AppButton variant="ghost" @click="exportCook">Als .cook speichern</AppButton>
      <slot name="actions" />
    </div>
    <p v-if="cookedAt" class="muted">
      Zuletzt gekocht am {{ new Date(cookedAt).toLocaleDateString('de-DE') }}
    </p>

    <div class="layout">
      <section aria-labelledby="ingredients-title">
        <h2 id="ingredients-title">Zutaten</h2>
        <ul class="ingredients">
          <li v-for="i in ingredientList" :key="`${i.name}-${i.reference ?? ''}`">
            <span class="qty">{{ i.amounts.map(formatAmount).join(' + ') }}</span>
            <template v-if="i.reference && referenceForListed(i.name, i.reference)?.entry">
              <details>
                <summary>
                  {{ i.name }}<span v-if="i.optional" class="muted"> (optional)</span>
                </summary>
                <RouterLink
                  v-if="recipeRoute(referenceForListed(i.name, i.reference)!.entry!)"
                  :to="recipeRoute(referenceForListed(i.name, i.reference)!.entry!)!"
                >
                  Rezept „{{ referenceForListed(i.name, i.reference)!.entry!.recipe.meta.title }}“
                  öffnen
                </RouterLink>
                <p
                  v-if="referenceForListed(i.name, i.reference)!.factor === undefined"
                  class="muted"
                >
                  Menge lässt sich nicht umrechnen – Zutaten für das ganze Rezept:
                </p>
                <ul>
                  <li
                    v-for="s in subRecipeIngredients(referenceForListed(i.name, i.reference)!)"
                    :key="s.name"
                  >
                    <span class="qty">{{ s.amounts.map(formatAmount).join(' + ') }}</span>
                    {{ s.name }}
                  </li>
                </ul>
              </details>
            </template>
            <span v-else>
              {{ i.name }}
              <span v-if="i.reference" class="warning">(Rezept nicht gefunden)</span>
              <span v-if="i.optional" class="muted">(optional)</span>
              <span v-if="i.notes.length" class="muted">– {{ i.notes.join(', ') }}</span>
            </span>
          </li>
        </ul>
        <template v-if="recipe.cookware.length">
          <h3>Kochgeschirr</h3>
          <ul class="plain">
            <li v-for="c in recipe.cookware" :key="c">{{ c }}</li>
          </ul>
        </template>
      </section>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title">Zubereitung</h2>
        <template v-for="(section, s) in recipe.sections" :key="s">
          <h3 v-if="section.name">{{ section.name }}</h3>
          <ol class="steps">
            <template v-for="(block, b) in stepBlocks(section.blocks)" :key="b">
              <li v-if="block.type === 'step'" :value="block.number">
                <template v-for="(t, k) in block.tokens" :key="k">
                  <template v-if="t.type === 'text'">{{ t.text }}</template>
                  <span v-else-if="t.type === 'ingredient'" class="ing">
                    <RouterLink
                      v-if="
                        referenceByIngredient.get(t.index)?.entry &&
                        recipeRoute(referenceByIngredient.get(t.index)!.entry!)
                      "
                      :to="recipeRoute(referenceByIngredient.get(t.index)!.entry!)!"
                      >{{ t.display }}</RouterLink><template v-else>{{ t.display }}</template>
                    <span v-if="recipe.ingredients[t.index]?.amount" class="qty">
                      ({{ formatAmount(recipe.ingredients[t.index]!.amount) }})</span
                    >
                  </span>
                  <span v-else-if="t.type === 'cookware'" class="cookware">{{ t.name }}</span>
                  <TimerButton
                    v-else-if="recipe.timers[t.index]"
                    :label="formatAmount(recipe.timers[t.index]!.amount)"
                    :seconds="timerSeconds(recipe.timers[t.index]!.amount)"
                    :name="recipe.timers[t.index]!.name"
                  />
                </template>
              </li>
              <li v-else class="note" role="note">{{ block.text }}</li>
            </template>
          </ol>
        </template>
      </section>
    </div>

    <p v-if="base.meta.source" class="muted">
      Quelle:
      <a v-if="sourceUrl" :href="sourceUrl" rel="noopener noreferrer" target="_blank">{{
        base.meta.source
      }}</a>
      <template v-else>{{ base.meta.source }}</template>
    </p>

    <RecipeNutrition v-if="nutrition" :nutrition="nutrition" />

    <RecipeReviews
      v-if="library && props.recipeId"
      :space-id="props.spaceId!"
      :recipe-id="props.recipeId"
    />
    <RecipeCollections
      v-if="library && props.recipeId"
      :library="library.doc"
      :recipe-id="props.recipeId"
    />

    <div v-if="library" class="danger-zone">
      <AppButton variant="danger" @click="confirmDelete = true">Rezept löschen</AppButton>
    </div>

    <CookMode v-if="cooking" :recipe="recipe" @close="cooking = false" />

    <AppDialog v-model:open="confirmShare" title="Rezept teilen?">
      <p>
        Es entsteht eine Freigabe mit einer Kopie von „{{ base.meta.title }}“ und allen verwendeten
        eigenen Unterrezepten. Wer den Link bekommt, kann sie ohne Konto lesen und übernehmen.
        Spätere Änderungen an deinem Rezept gelangen nicht in die Freigabe.
      </p>
      <p v-if="actionError" role="alert" class="warning">{{ actionError }}</p>
      <template #actions>
        <AppButton @click="confirmShare = false">Abbrechen</AppButton>
        <AppButton variant="primary" @click="share">Freigabe erstellen</AppButton>
      </template>
    </AppDialog>

    <AppDialog v-model:open="planOpen" title="Einplanen">
      <form v-if="planOpen" id="plan-form" class="plan-form" @submit.prevent="plan">
        <div v-if="planTargets.length > 1" class="field">
          <label for="plan-space">Bereich</label>
          <select id="plan-space" v-model="planSpace">
            <option v-for="t in planTargets" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <AppTextField
          v-model="planDate"
          label="Tag"
          type="date"
          hint="Leer lassen für den Ideen-Pool."
        />
        <div v-if="planMeals.length > 1" class="field">
          <label for="plan-meal">Mahlzeit</label>
          <select id="plan-meal" v-model="planMeal">
            <option v-for="m in planMeals" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>
        <p v-if="servings" class="muted">Für {{ formatNumber(servings) }} Portionen.</p>
      </form>
      <template #actions>
        <AppButton @click="planOpen = false">Abbrechen</AppButton>
        <AppButton type="submit" form="plan-form" variant="primary">Einplanen</AppButton>
      </template>
    </AppDialog>

    <ShoppingPreview v-model:open="shoppingOpen" :requests="shoppingRequests" />
    <AppToast v-if="toast" :duration="5000" @dismiss="toast = undefined">
      {{ toast }}
      <template #actions>
        <RouterLink
          :to="{
            name: 'plan',
            query: { b: planSpace ?? planTargets[0]?.id, woche: planDate || undefined },
          }"
          >Zum Plan</RouterLink
        >
      </template>
    </AppToast>

    <AppDialog v-model:open="confirmDelete" title="Rezept löschen?">
      <p>„{{ base.meta.title }}“ wird mit Notizen und Bewertungen auf allen Geräten gelöscht.</p>
      <template #actions>
        <AppButton @click="confirmDelete = false">Abbrechen</AppButton>
        <AppButton variant="danger" @click="remove">Löschen</AppButton>
      </template>
    </AppDialog>
  </template>
  <p v-else-if="handles.length">Rezept nicht gefunden.</p>
</template>

<style scoped>
.lead {
  font-size: var(--font-size-lg);
  color: var(--text-muted);
}
.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-4);
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}
.servings {
  display: inline-flex;
  align-items: center;
}
.tag {
  padding: 0 var(--space-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-sm);
}
.warnings {
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-6);
  border-left: 4px solid var(--warning);
  background: var(--surface);
}
.catalog-photo {
  width: 100%;
  max-height: 28rem;
  object-fit: cover;
  border-radius: var(--radius-md);
}
.origin {
  padding: var(--space-2) var(--space-3);
  border-left: 4px solid var(--primary);
  background: var(--surface);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.btn-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target);
  padding: 0 var(--space-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}
.layout {
  display: grid;
  gap: var(--space-6);
  margin-top: var(--space-6);
}
@media (min-width: 48rem) {
  .layout {
    grid-template-columns: minmax(14rem, 1fr) 2fr;
  }
}
.ingredients,
.plain {
  margin: 0;
  padding: 0;
  list-style: none;
}
.ingredients > li {
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--border);
}
.ingredients details ul {
  margin: var(--space-2) 0 0 var(--space-4);
  padding: 0;
  list-style: none;
}
.qty {
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.ingredients .qty {
  display: inline-block;
  min-width: 5rem;
}
.steps {
  padding-left: var(--space-6);
  line-height: 1.7;
}
.steps > li {
  margin-bottom: var(--space-3);
}
.ing {
  color: var(--accent-text);
  font-weight: 600;
}
.ing .qty {
  font-weight: 400;
}
.cookware {
  font-style: italic;
}
.note {
  list-style: none;
  margin-left: calc(-1 * var(--space-6));
  padding: var(--space-2) var(--space-3);
  border-left: 4px solid var(--primary);
  background: var(--surface);
}
.muted {
  color: var(--text-muted);
}
.warning {
  color: var(--warning);
}
.adopt {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
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
.danger-zone {
  margin-top: var(--space-8);
}
.plan-form {
  display: grid;
  gap: var(--space-4);
}
</style>
