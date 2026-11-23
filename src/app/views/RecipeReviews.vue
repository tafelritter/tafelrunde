<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import {
  type Review,
  averageStars,
  formatNumber,
  getReviews,
  personNames,
  setReview,
  spaceKind,
} from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import { useRecipes } from '../recipes/recipe-store'
import { workspace } from '../workspace/use-workspace'
import type { Workspace } from '../workspace/workspace'

/**
 * Notizen und Bewertungen (plan/04-phase-2-rezepte.md, 2.8). Sichtbar für
 * alle im Bereich des Rezepts – im persönlichen Bereich also privat.
 */
const props = defineProps<{ spaceId: string; recipeId: string }>()
const { handles } = useRecipes()
const ws = shallowRef<Workspace>()
onMounted(async () => (ws.value = await workspace()))

const handle = computed(() => handles.value.find((h) => h.record.id === props.spaceId))
const version = ref(0)
watch(
  handle,
  (h, _old, onCleanup) => {
    if (!h?.library) return
    const bump = () => version.value++
    h.library.doc.on('update', bump)
    onCleanup(() => h.library?.doc.off('update', bump))
  },
  { immediate: true },
)

const reviews = computed<Review[]>(() => {
  void version.value
  return handle.value?.library ? getReviews(handle.value.library.doc, props.recipeId) : []
})
const names = computed(() => {
  void version.value
  return handle.value ? personNames(handle.value.doc) : new Map<string, string>()
})
const isPrivate = computed(() =>
  handle.value ? spaceKind(handle.value.doc) === 'personal' : false,
)
const average = computed(() => averageStars(reviews.value))
const mine = computed(() => reviews.value.find((r) => r.personId === ws.value?.profile?.personId))

const note = ref('')
watch(mine, (m) => (note.value = m?.note ?? ''), { immediate: true })

function rate(stars: number | null) {
  const lib = handle.value?.library
  const personId = ws.value?.profile?.personId
  if (lib && personId) setReview(lib.doc, props.recipeId, personId, { stars })
}

function saveNote() {
  const lib = handle.value?.library
  const personId = ws.value?.profile?.personId
  if (lib && personId) setReview(lib.doc, props.recipeId, personId, { note: note.value })
}

// --- Private Notiz zu einem Haushaltsrezept: liegt im persönlichen Bereich --------

const personal = computed(() =>
  handles.value.find((h) => spaceKind(h.doc) === 'personal' && h.record.id !== props.spaceId),
)
/** Verweis auf das Rezept eines anderen Bereichs als Schlüssel im persönlichen Bereich. */
const privateKey = computed(() => `${props.spaceId}-${props.recipeId}`)
const privateVersion = ref(0)
watch(
  personal,
  (h, _old, onCleanup) => {
    if (!h?.library) return
    const bump = () => privateVersion.value++
    h.library.doc.on('update', bump)
    onCleanup(() => h.library?.doc.off('update', bump))
  },
  { immediate: true },
)
const privateNote = ref('')
watch(
  [personal, privateVersion, () => ws.value?.profile?.personId],
  () => {
    const lib = personal.value?.library
    const personId = ws.value?.profile?.personId
    const mineThere =
      lib && personId
        ? getReviews(lib.doc, privateKey.value).find((r) => r.personId === personId)
        : undefined
    privateNote.value = mineThere?.note ?? ''
  },
  { immediate: true },
)
function savePrivateNote() {
  const lib = personal.value?.library
  const personId = ws.value?.profile?.personId
  if (lib && personId) setReview(lib.doc, privateKey.value, personId, { note: privateNote.value })
}
</script>

<template>
  <section class="reviews" aria-labelledby="reviews-title">
    <h2 id="reviews-title">Notizen und Bewertungen</h2>
    <p class="muted">
      {{ isPrivate ? 'Nur für dich sichtbar.' : 'Für alle in diesem Bereich sichtbar.' }}
      <template v-if="average !== undefined">
        Durchschnitt: {{ formatNumber(average) }} von 5 Sternen.
      </template>
    </p>

    <fieldset class="stars">
      <legend>Deine Bewertung</legend>
      <AppButton
        v-for="n in 5"
        :key="n"
        variant="ghost"
        :aria-pressed="(mine?.stars ?? 0) >= n"
        @click="rate(mine?.stars === n ? null : n)"
      >
        <span aria-hidden="true">{{ (mine?.stars ?? 0) >= n ? '★' : '☆' }}</span>
        <span class="visually-hidden">{{ n }} {{ n === 1 ? 'Stern' : 'Sterne' }}</span>
      </AppButton>
    </fieldset>

    <form class="note" @submit.prevent="saveNote">
      <label for="review-note">Deine Notiz</label>
      <textarea id="review-note" v-model="note" rows="3" maxlength="5000"></textarea>
      <div><AppButton type="submit">Notiz speichern</AppButton></div>
    </form>

    <form v-if="!isPrivate && personal" class="note" @submit.prevent="savePrivateNote">
      <label for="review-private-note">Private Notiz (nur für dich)</label>
      <textarea id="review-private-note" v-model="privateNote" rows="2" maxlength="5000"></textarea>
      <div><AppButton type="submit">Private Notiz speichern</AppButton></div>
    </form>

    <ul class="others">
      <li
        v-for="r in reviews.filter((x) => x.personId !== ws?.profile?.personId)"
        :key="r.personId"
      >
        <strong>{{ names.get(r.personId) ?? 'Jemand' }}</strong>
        <span v-if="r.stars">
          <span aria-hidden="true"> {{ '★'.repeat(r.stars) }}</span>
          <span class="visually-hidden">{{ r.stars }} von 5 Sternen</span>
        </span>
        <p v-if="r.note">{{ r.note }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.reviews {
  margin-top: var(--space-8);
}
.muted {
  color: var(--text-muted);
}
.stars {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border: 0;
  padding: 0;
  margin: 0 0 var(--space-4);
}
.stars legend {
  font-weight: 600;
  margin-bottom: var(--space-1);
}
.stars :deep(button) {
  font-size: var(--font-size-lg);
  padding: 0 var(--space-2);
}
.note {
  margin-bottom: var(--space-4);
  display: grid;
  gap: var(--space-1);
}
.note label {
  font-weight: 600;
}
textarea {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.others {
  margin: var(--space-4) 0 0;
  padding: 0;
  list-style: none;
}
.others li {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}
.others p {
  margin: var(--space-1) 0 0;
  white-space: pre-wrap;
}
</style>
