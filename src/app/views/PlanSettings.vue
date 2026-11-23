<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue'
import type * as Y from 'yjs'
import {
  addPantryItem,
  getMeals,
  getPantry,
  normalizeName,
  removePantryItem,
  setMeals,
} from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import { catalogItem, catalogNames } from '../catalog'
import { useDocVersion } from '../workspace/use-workspace'

/** Mahlzeiten des Haushalts (3.2) und Grundvorräte „immer im Haus“ (3.6). */
const props = defineProps<{ doc: Y.Doc }>()
const version = useDocVersion(toRef(props, 'doc'))

const meals = computed(() => (version.value, getMeals(props.doc)))
const newMeal = ref('')
function addMeal() {
  if (!newMeal.value.trim()) return
  setMeals(props.doc, [...meals.value, { name: newMeal.value }])
  newMeal.value = ''
}
function removeMeal(id: string) {
  if (meals.value.length > 1)
    setMeals(
      props.doc,
      meals.value.filter((m) => m.id !== id),
    )
}
function moveMeal(index: number, delta: number) {
  const next = [...meals.value]
  const [m] = next.splice(index, 1)
  next.splice(index + delta, 0, m!)
  setMeals(props.doc, next)
}

const pantry = computed(() => (version.value, getPantry(props.doc)))
const newPantry = ref('')
const datalistId = useId()
function addPantry() {
  const name = newPantry.value.trim()
  if (!name) return
  const ref = catalogItem(normalizeName(name))
  addPantryItem(props.doc, ref?.name ?? name, ref?.id)
  newPantry.value = ''
}
</script>

<template>
  <details class="settings">
    <summary>Mahlzeiten und Grundvorräte</summary>
    <section aria-labelledby="meals-title">
      <h3 id="meals-title">Mahlzeiten</h3>
      <p class="muted">Was ihr plant – zum Beispiel nur das Abendessen.</p>
      <ul class="plain">
        <li v-for="(m, i) in meals" :key="m.id" class="meal">
          <span>{{ m.name }}</span>
          <AppButton variant="ghost" :disabled="i === 0" @click="moveMeal(i, -1)">
            ↑<span class="visually-hidden"> {{ m.name }} nach oben</span>
          </AppButton>
          <AppButton variant="ghost" :disabled="i === meals.length - 1" @click="moveMeal(i, 1)">
            ↓<span class="visually-hidden"> {{ m.name }} nach unten</span>
          </AppButton>
          <AppButton variant="ghost" :disabled="meals.length < 2" @click="removeMeal(m.id)">
            Entfernen<span class="visually-hidden">: {{ m.name }}</span>
          </AppButton>
        </li>
      </ul>
      <form class="add" @submit.prevent="addMeal">
        <AppTextField v-model="newMeal" label="Neue Mahlzeit" maxlength="40" />
        <AppButton type="submit" :disabled="!newMeal.trim()">Hinzufügen</AppButton>
      </form>
    </section>

    <section aria-labelledby="pantry-title">
      <h3 id="pantry-title">Grundvorräte</h3>
      <p class="muted">
        Immer im Haus, z. B. Salz, Pfeffer, Öl. Beim Übernehmen auf die Einkaufsliste sind sie nicht
        ausgewählt.
      </p>
      <ul class="chips">
        <li v-for="p in pantry" :key="p.key">
          {{ p.name }}
          <AppButton variant="ghost" @click="removePantryItem(doc, p.key)">
            ×<span class="visually-hidden"> {{ p.name }} entfernen</span>
          </AppButton>
        </li>
      </ul>
      <form class="add" @submit.prevent="addPantry">
        <AppTextField
          v-model="newPantry"
          label="Grundvorrat hinzufügen"
          :list="datalistId"
          autocomplete="off"
          maxlength="100"
        />
        <AppButton type="submit" :disabled="!newPantry.trim()">Hinzufügen</AppButton>
        <datalist :id="datalistId">
          <option v-for="n in catalogNames()" :key="n" :value="n" />
        </datalist>
      </form>
    </section>
  </details>
</template>

<style scoped>
.settings {
  margin-top: var(--space-8);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.settings summary {
  font-weight: 600;
  cursor: pointer;
}
.plain {
  margin: 0;
  padding: 0;
  list-style: none;
}
.meal {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.meal span {
  flex: 1;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: 0;
  list-style: none;
}
.chips li {
  display: inline-flex;
  align-items: center;
  padding-left: var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
}
.add {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-2);
}
.muted {
  color: var(--text-muted);
}
</style>
