<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  type PlanChange,
  type PlanEntry,
  type PlanItemChange,
  type RecipeEntry,
  type ShoppingRequest,
  addDays,
  addPlanEntry,
  applyPlanChange,
  dateRange,
  getMeals,
  getPlanEntry,
  isPlanDate,
  logCooked,
  movePlanEntry,
  planChangeEffects,
  planEntriesBetween,
  planIdeas,
  removePlanEntry,
  setPlanStatus,
  setReview,
  spaceKind,
  toPlanDate,
  updatePlanEntry,
  weekStart,
} from '@/core'
import AppBadge from '@/ui/components/AppBadge.vue'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import AppToast from '@/ui/components/AppToast.vue'
import { dayLabel, planRequest, planSpaces, servingsFactor } from '../plan/plan-helpers'
import { loadNutrition, nutritionOf } from '../nutrition'
import { loadCatalogRecipes } from '../recipes/catalog-recipes'
import { useRecipes } from '../recipes/recipe-store'
import { recipeRoute } from '../recipes/routes'
import { useDocVersion, workspace } from '../workspace/use-workspace'
import PlanEntryDialog, { type PlanEntryForm } from './PlanEntryDialog.vue'
import PlanSettings from './PlanSettings.vue'
import ShoppingPreview from './ShoppingPreview.vue'

/** Wochenplan (plan/05-phase-3-planung.md, 3.2): Tage als Karten, darunter der Ideen-Pool. */
const route = useRoute()
const router = useRouter()
const { handles, index } = useRecipes()
void loadCatalogRecipes()
void loadNutrition()
const profile = shallowRef<{ deviceId: string; personId: string }>()
void workspace().then((ws) => (profile.value = ws.profile))

// --- Bereich und Woche ------------------------------------------------------------

const spaces = computed(() => planSpaces(handles.value))
const spaceId = computed(() => {
  const wanted = route.query.b
  return spaces.value.find((s) => s.id === wanted)?.id ?? spaces.value[0]?.id
})
const handle = computed(() => handles.value.find((h) => h.record.id === spaceId.value))
const doc = computed(() => handle.value?.doc)
const version = useDocVersion(doc)

const today = ref(toPlanDate(new Date()))
const week = computed(() => {
  const w = route.query.woche
  return weekStart(isPlanDate(w) ? w : today.value)
})
const days = computed(() => dateRange(week.value, addDays(week.value, 6)))
function go(query: { b?: string; woche?: string }) {
  void router.replace({
    query: { ...route.query, ...query },
  })
}

const meals = computed(() => (version.value, doc.value ? getMeals(doc.value) : []))
const entries = computed(() => {
  void version.value
  return doc.value ? planEntriesBetween(doc.value, week.value, addDays(week.value, 6)) : []
})
const ideas = computed(() => (version.value, doc.value ? planIdeas(doc.value) : []))
function slot(date: string, meal: string) {
  const known = new Set(meals.value.map((m) => m.id))
  return entries.value.filter(
    (e) =>
      e.date === date && (e.meal === meal || (!known.has(e.meal) && meal === meals.value[0]?.id)),
  )
}

const recipeOf = (e: PlanEntry) =>
  e.recipeKey ? index.value.entries.find((r) => r.key === e.recipeKey) : undefined
const recipeLink = (e: PlanEntry) => {
  const r = recipeOf(e)
  return r ? recipeRoute(r) : undefined
}
const cookLink = (e: PlanEntry) => {
  const to = recipeLink(e)
  return to && typeof to === 'object'
    ? { ...to, query: { kochen: '1', portionen: e.servings } }
    : undefined
}

/** Alle Rezepte zur Auswahl: eigene Bereiche (ohne Freigaben) und Katalog. */
const choosable = computed(() =>
  index.value.entries.filter((e) => {
    if (e.scope === 'catalog') return true
    const h = handles.value.find((x) => x.record.id === e.scope)
    return h && spaceKind(h.doc) !== 'recipe-share'
  }),
)
function recipeLabel(e: RecipeEntry): string {
  const title = e.recipe.meta.title || 'Ohne Titel'
  if (e.scope === 'catalog') return `${title} (Katalog)`
  if (e.scope === spaceId.value) return title
  return `${title} (${spaces.value.find((s) => s.id === e.scope)?.name ?? 'anderer Bereich'})`
}

// --- Anlegen und Ändern -------------------------------------------------------

const dialogOpen = ref(false)
const editing = shallowRef<PlanEntry>()
const initial = ref<{ date: string; meal: string }>({ date: '', meal: '' })

function addAt(date: string, meal: string) {
  editing.value = undefined
  initial.value = { date, meal }
  dialogOpen.value = true
}
function openEntry(e: PlanEntry) {
  editing.value = e
  dialogOpen.value = true
}

/** Rückfrage, ob die Einkaufsliste nachgezogen werden soll (3.7). */
const pending = shallowRef<{
  entryId: string
  change: PlanChange
  effects: PlanItemChange[]
  then: () => void
}>()

function withListCheck(entryId: string, change: PlanChange, then: () => void) {
  const d = doc.value
  const effects = d ? planChangeEffects(d, entryId, change) : []
  if (!effects.length) then()
  else pending.value = { entryId, change, effects, then }
}
function resolvePending(adjust: boolean) {
  const p = pending.value
  if (!p || !doc.value) return
  if (adjust) applyPlanChange(doc.value, p.entryId, p.change)
  p.then()
  pending.value = undefined
}

function save(form: PlanEntryForm) {
  const d = doc.value
  if (!d || !profile.value) return
  const date = form.date || undefined
  const e = editing.value
  dialogOpen.value = false
  if (!e) {
    const input: Parameters<typeof addPlanEntry>[1] = {
      title: form.title,
      meal: form.meal,
      note: form.note,
    }
    if (date) input.date = date
    if (form.recipeKey) input.recipeKey = form.recipeKey
    if (form.servings !== undefined) input.servings = form.servings
    addPlanEntry(d, input, profile.value.personId)
    return
  }
  const apply = () => {
    d.transact(() => {
      updatePlanEntry(d, e.id, { title: form.title, note: form.note, servings: form.servings })
      movePlanEntry(d, e.id, date, form.meal)
    })
  }
  const recipe = recipeOf(e)?.recipe
  if (recipe && form.servings !== e.servings) {
    const change = servingsFactor(recipe, form.servings) / servingsFactor(recipe, e.servings)
    withListCheck(e.id, change, apply)
  } else apply()
}

function remove() {
  const d = doc.value
  const e = editing.value
  if (!d || !e) return
  dialogOpen.value = false
  withListCheck(e.id, 'remove', () => removePlanEntry(d, e.id))
}

// --- Drag & Drop (Desktop) ------------------------------------------------------

const dropTarget = ref<string>()
function onDragStart(event: DragEvent, e: PlanEntry) {
  event.dataTransfer?.setData('application/x-tafelrunde-plan', e.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function onDrop(event: DragEvent, date: string | undefined, meal?: string) {
  dropTarget.value = undefined
  const id = event.dataTransfer?.getData('application/x-tafelrunde-plan')
  if (id && doc.value && getPlanEntry(doc.value, id)) movePlanEntry(doc.value, id, date, meal)
}

// --- Gekocht (3.8) ------------------------------------------------------------------

const rating = shallowRef<{ spaceId: string; recipeId: string; title: string }>()
const toast = ref<string>()

function markCooked() {
  const d = doc.value
  const e = editing.value
  if (!d || !e || !profile.value) return
  dialogOpen.value = false
  setPlanStatus(d, e.id, 'cooked')
  // Koch-Protokoll und „zuletzt gekocht“ beim Rezept, wenn es in einem eigenen Bereich liegt.
  const own = /^space:([\w-]+)\/([\w-]+)$/.exec(e.recipeKey ?? '')
  const lib = own && handles.value.find((h) => h.record.id === own[1])
  if (own && lib?.library && spaceKind(lib.doc) !== 'recipe-share') {
    logCooked(lib.library.doc, own[2]!, profile.value.personId)
    rating.value = { spaceId: own[1]!, recipeId: own[2]!, title: e.title }
  } else toast.value = `„${e.title}“ als gekocht markiert.`
}
function reopen() {
  const d = doc.value
  const e = editing.value
  if (d && e) setPlanStatus(d, e.id, 'planned')
  dialogOpen.value = false
}
function rate(stars: number) {
  const r = rating.value
  const lib = handles.value.find((h) => h.record.id === r?.spaceId)?.library
  if (r && lib && profile.value) setReview(lib.doc, r.recipeId, profile.value.personId, { stars })
  rating.value = undefined
  toast.value = 'Danke für die Bewertung.'
}

// --- Einkaufsliste (3.3) ------------------------------------------------------------

const rangeOpen = ref(false)
const from = ref('')
const to = ref('')
function openRange() {
  from.value = week.value < today.value && today.value <= days.value[6]! ? today.value : week.value
  to.value = days.value[6]!
  rangeOpen.value = true
}
const rangeEntries = computed(() => {
  void version.value
  if (!doc.value || !isPlanDate(from.value) || !isPlanDate(to.value)) return []
  return planEntriesBetween(doc.value, from.value, to.value).filter((e) => e.status === 'planned')
})
const rangeRequests = computed(() =>
  rangeEntries.value.flatMap((e) => planRequest(e, index.value) ?? []),
)
const withoutRecipe = computed(() =>
  rangeEntries.value.filter((e) => !planRequest(e, index.value)).map((e) => e.title),
)
const previewOpen = ref(false)
const previewRequests = shallowRef<ShoppingRequest[]>([])
function openPreview() {
  previewRequests.value = rangeRequests.value
  rangeOpen.value = false
  previewOpen.value = true
}

// --- Nährwerte (4.8): Summe je Person über die Portionen des Tages bzw. der Woche ---

function kcalOf(e: PlanEntry): number | undefined {
  const r = recipeOf(e)
  if (!r) return undefined
  return nutritionOf(index.value, r.recipe, r.scope)?.perServing?.kcal
}
function kcalSum(list: PlanEntry[]): { kcal: number; open: number } | undefined {
  const withRecipe = list.filter((e) => e.recipeKey)
  if (!withRecipe.length) return undefined
  const values = withRecipe.map(kcalOf)
  const known = values.filter((v): v is number => v !== undefined && v > 0)
  if (!known.length) return undefined
  return { kcal: known.reduce((a, b) => a + b, 0), open: values.length - known.length }
}
const dayKcal = (date: string) => kcalSum(entries.value.filter((e) => e.date === date))
const weekKcal = computed(() => kcalSum(entries.value))
const kcalText = (s: { kcal: number; open: number }) =>
  `≈ ${Math.round(s.kcal).toLocaleString('de-DE')} kcal je Person` +
  (s.open ? ` (ohne ${s.open} ${s.open === 1 ? 'Eintrag' : 'Einträge'})` : '')

const servingsText = (e: PlanEntry) =>
  e.servings ? `${String(e.servings).replace('.', ',')} P.` : undefined
</script>

<template>
  <div class="title">
    <h1>Wochenplan</h1>
    <div v-if="spaces.length > 1" class="field">
      <label for="plan-space">Bereich</label>
      <select
        id="plan-space"
        :value="spaceId"
        @change="go({ b: ($event.target as HTMLSelectElement).value })"
      >
        <option v-for="s in spaces" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </div>
  </div>

  <template v-if="doc">
    <nav class="week-nav" aria-label="Woche wählen">
      <AppButton variant="ghost" @click="go({ woche: addDays(week, -7) })">
        ← <span class="visually-hidden">Vorige Woche</span>
      </AppButton>
      <span aria-live="polite">{{ dayLabel(days[0]!) }} – {{ dayLabel(days[6]!) }}</span>
      <AppButton variant="ghost" @click="go({ woche: addDays(week, 7) })">
        → <span class="visually-hidden">Nächste Woche</span>
      </AppButton>
      <AppButton v-if="!days.includes(today)" variant="ghost" @click="go({ woche: today })">
        Diese Woche
      </AppButton>
      <AppButton variant="primary" class="shop" @click="openRange"
        >Einkaufsliste erstellen</AppButton
      >
    </nav>

    <p v-if="weekKcal" class="kcal">Woche: {{ kcalText(weekKcal) }}</p>

    <div class="days">
      <AppCard v-for="date in days" :key="date" :class="['day', { 'day--today': date === today }]">
        <h2 class="day__title">
          {{ dayLabel(date, 'long') }}
          <AppBadge v-if="date === today">Heute</AppBadge>
        </h2>
        <p v-if="dayKcal(date)" class="kcal">{{ kcalText(dayKcal(date)!) }}</p>
        <div
          v-for="m in meals"
          :key="m.id"
          :class="['slot', { 'slot--drop': dropTarget === `${date}/${m.id}` }]"
          @dragover.prevent="dropTarget = `${date}/${m.id}`"
          @dragleave="dropTarget = undefined"
          @drop.prevent="onDrop($event, date, m.id)"
        >
          <h3 v-if="meals.length > 1" class="slot__title">{{ m.name }}</h3>
          <ul class="entries">
            <li
              v-for="e in slot(date, m.id)"
              :key="e.id"
              :class="['entry', { 'entry--cooked': e.status === 'cooked' }]"
              draggable="true"
              @dragstart="onDragStart($event, e)"
            >
              <span class="entry__main">
                <RouterLink v-if="recipeLink(e)" :to="recipeLink(e)!">{{ e.title }}</RouterLink>
                <template v-else>{{ e.title }}</template>
                <span v-if="servingsText(e)" class="muted"> · {{ servingsText(e) }}</span>
                <span v-if="e.status === 'cooked'" class="muted"> · gekocht</span>
                <small v-if="e.note" class="entry__note">{{ e.note }}</small>
              </span>
              <RouterLink
                v-if="date === today && e.status === 'planned' && cookLink(e)"
                :to="cookLink(e)!"
                class="cook-badge"
              >
                <AppBadge>Heute kochen</AppBadge>
              </RouterLink>
              <AppButton variant="ghost" @click="openEntry(e)">
                Ändern<span class="visually-hidden">: {{ e.title }}</span>
              </AppButton>
            </li>
          </ul>
          <AppButton variant="ghost" class="add" @click="addAt(date, m.id)">
            + <span class="visually-hidden">{{ m.name }} am {{ dayLabel(date, 'long') }}</span
            ><span aria-hidden="true">Hinzufügen</span>
          </AppButton>
        </div>
      </AppCard>
    </div>

    <section
      :class="['ideas', { 'slot--drop': dropTarget === 'pool' }]"
      aria-labelledby="ideas-title"
      @dragover.prevent="dropTarget = 'pool'"
      @dragleave="dropTarget = undefined"
      @drop.prevent="onDrop($event, undefined)"
    >
      <h2 id="ideas-title">Ideen-Pool</h2>
      <p v-if="!ideas.length" class="muted">
        Noch keine Ideen. Was ihr bald kochen wollt, aber noch keinem Tag zugeordnet habt.
      </p>
      <ul class="entries">
        <li
          v-for="e in ideas"
          :key="e.id"
          class="entry"
          draggable="true"
          @dragstart="onDragStart($event, e)"
        >
          <span class="entry__main">
            <RouterLink v-if="recipeLink(e)" :to="recipeLink(e)!">{{ e.title }}</RouterLink>
            <template v-else>{{ e.title }}</template>
            <span v-if="servingsText(e)" class="muted"> · {{ servingsText(e) }}</span>
          </span>
          <AppButton variant="ghost" @click="openEntry(e)">
            Ändern<span class="visually-hidden">: {{ e.title }}</span>
          </AppButton>
        </li>
      </ul>
      <AppButton @click="addAt('', meals[0]?.id ?? '')">Idee hinzufügen</AppButton>
    </section>

    <PlanSettings :doc="doc" />
  </template>
  <p v-else-if="handles.length">Kein Bereich für den Plan gefunden.</p>

  <PlanEntryDialog
    v-model:open="dialogOpen"
    :entry="editing"
    :initial="initial"
    :meals="meals"
    :recipes="choosable"
    :recipe-label="recipeLabel"
    @save="save"
    @remove="remove"
    @cooked="markCooked"
    @reopen="reopen"
  />

  <AppDialog
    :open="!!pending"
    title="Einkaufsliste anpassen?"
    @update:open="(v) => !v && resolvePending(false)"
  >
    <template v-if="pending">
      <p>Diese offenen Einträge gehören zum geänderten Planeintrag:</p>
      <ul>
        <li v-for="c in pending.effects" :key="c.itemId">
          {{ c.name }}: {{ c.before || 'ohne Menge' }} →
          <template v-if="c.after === undefined">entfernen</template>
          <template v-else-if="c.edited">bleibt (von Hand geändert)</template>
          <template v-else>{{ c.after || 'ohne Menge' }}</template>
        </li>
      </ul>
    </template>
    <template #actions>
      <AppButton @click="resolvePending(false)">Liste nicht ändern</AppButton>
      <AppButton variant="primary" @click="resolvePending(true)">Liste anpassen</AppButton>
    </template>
  </AppDialog>

  <AppDialog
    :open="!!rating"
    title="Wie hat es geschmeckt?"
    @update:open="(v) => !v && (rating = undefined)"
  >
    <p v-if="rating">„{{ rating.title }}“ steht jetzt im Koch-Protokoll. Magst du es bewerten?</p>
    <div class="stars" role="group" aria-label="Bewertung">
      <AppButton v-for="n in 5" :key="n" variant="ghost" @click="rate(n)">
        {{ '★'.repeat(n) }}<span class="visually-hidden"> {{ n }} von 5 Sternen</span>
      </AppButton>
    </div>
    <template #actions>
      <AppButton @click="rating = undefined">Überspringen</AppButton>
    </template>
  </AppDialog>

  <AppDialog v-model:open="rangeOpen" title="Einkaufsliste aus dem Plan">
    <form id="range-form" class="stack" @submit.prevent="openPreview">
      <div class="row">
        <AppTextField v-model="from" label="Von" type="date" />
        <AppTextField v-model="to" label="Bis" type="date" />
      </div>
      <p>
        {{ rangeRequests.length }}
        {{ rangeRequests.length === 1 ? 'Rezept' : 'Rezepte' }} geplant.
        <template v-if="withoutRecipe.length">
          Ohne Rezept (nicht berücksichtigt): {{ withoutRecipe.join(', ') }}.
        </template>
      </p>
    </form>
    <template #actions>
      <AppButton @click="rangeOpen = false">Abbrechen</AppButton>
      <AppButton
        type="submit"
        form="range-form"
        variant="primary"
        :disabled="!rangeRequests.length"
      >
        Weiter
      </AppButton>
    </template>
  </AppDialog>

  <ShoppingPreview
    v-model:open="previewOpen"
    :requests="previewRequests"
    :space-id="spaceId"
    title="Einkaufsliste aus dem Plan"
  />

  <AppToast v-if="toast" :duration="5000" @dismiss="toast = undefined">{{ toast }}</AppToast>
</template>

<style scoped>
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-3);
}
.week-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-4) 0;
}
.week-nav .shop {
  margin-left: auto;
}
.days {
  display: grid;
  gap: var(--space-3);
}
@media (min-width: 40rem) {
  .days {
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  }
}
.day--today {
  border-color: var(--primary);
}
.day__title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-md);
}
.kcal {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.slot {
  border-radius: var(--radius-sm);
}
.slot + .slot {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}
.slot--drop {
  outline: 2px dashed var(--primary);
  outline-offset: 2px;
}
.slot__title {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
.entries {
  margin: 0;
  padding: 0;
  list-style: none;
}
.entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  padding: var(--space-1) 0;
  cursor: grab;
}
.entry__main {
  flex: 1;
  min-width: 8rem;
}
.entry__note {
  display: block;
  color: var(--text-muted);
}
.entry--cooked .entry__main {
  color: var(--text-muted);
}
.cook-badge {
  text-decoration: none;
}
.ideas {
  margin-top: var(--space-6);
  padding: var(--space-2);
  border-radius: var(--radius-md);
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
.stars {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
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
.muted {
  color: var(--text-muted);
}
</style>
