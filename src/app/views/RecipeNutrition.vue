<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed } from 'vue'
import {
  type NutrientKey,
  type RecipeNutrition,
  NUTRIENT_LABELS,
  NUTRITION_ATTRIBUTION,
  formatNumber,
} from '@/core'

/** Nährwerttabelle der Rezeptansicht (4.8). Alle Werte sind Näherungen („≈“). */
const props = defineProps<{ nutrition: RecipeNutrition }>()

const ROWS: NutrientKey[] = [
  'kcal',
  'fett',
  'fett_gesaettigt',
  'kohlenhydrate',
  'zucker',
  'ballaststoffe',
  'eiweiss',
  'salz',
]
const percent = computed(() => Math.round(props.nutrition.coverage * 100))
const per100 = computed(() => {
  const g = props.nutrition.grams
  return g > 0 ? (k: NutrientKey) => (props.nutrition.total[k] * 100) / g : undefined
})
function value(k: NutrientKey, v: number): string {
  // Näherungswerte: kcal ganzzahlig, Gramm auf eine Stelle (kleine Werte auf zwei).
  const rounded = k === 'kcal' ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : v
  return `≈ ${formatNumber(rounded)} ${NUTRIENT_LABELS[k].unit}`
}
</script>

<template>
  <section class="nutrition" aria-labelledby="nutrition-title">
    <h2 id="nutrition-title">Nährwerte</h2>
    <p v-if="nutrition.counted === 0" class="muted">
      Für dieses Rezept liegen noch keine Nährwerte vor.
    </p>
    <template v-else>
      <table>
        <caption class="visually-hidden">
          Nährwerte, Näherung
        </caption>
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">Nährstoff</span></th>
            <th v-if="nutrition.perServing" scope="col">je Portion</th>
            <th v-if="per100" scope="col">je 100 g</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="k in ROWS" :key="k" :class="{ sub: NUTRIENT_LABELS[k].sub }">
            <th scope="row">{{ NUTRIENT_LABELS[k].label }}</th>
            <td v-if="nutrition.perServing">{{ value(k, nutrition.perServing[k]) }}</td>
            <td v-if="per100">{{ value(k, per100(k)) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted">
        {{ percent }} % der Zutaten erfasst<template v-if="nutrition.missing.length">
          – ohne {{ nutrition.missing.join(', ') }}</template
        >.
        <template v-if="nutrition.incomplete.length">
          Für einzelne Zutaten fehlen Werte zu
          {{ nutrition.incomplete.map((k) => NUTRIENT_LABELS[k].label).join(', ') }}.
        </template>
        <template v-if="nutrition.withoutAmount.length">
          Ohne Mengenangabe nicht eingerechnet: {{ nutrition.withoutAmount.join(', ') }}.
        </template>
      </p>
    </template>
    <p class="source">
      {{ NUTRITION_ATTRIBUTION.text }},
      <a :href="NUTRITION_ATTRIBUTION.licenseUrl" rel="noopener noreferrer" target="_blank">{{
        NUTRITION_ATTRIBUTION.license
      }}</a>
      (<a :href="NUTRITION_ATTRIBUTION.doiUrl" rel="noopener noreferrer" target="_blank">Quelle</a
      >). Gewichte für Stück und Löffel: eigene Richtwerte.
    </p>
  </section>
</template>

<style scoped>
.nutrition {
  margin-top: var(--space-6);
}
table {
  border-collapse: collapse;
  min-width: min(100%, 24rem);
}
th,
td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-variant-numeric: tabular-nums;
}
td {
  text-align: right;
  white-space: nowrap;
}
thead th {
  text-align: right;
}
.sub th {
  padding-left: var(--space-6);
  font-weight: 400;
}
.muted {
  color: var(--text-muted);
}
.source {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}
</style>
