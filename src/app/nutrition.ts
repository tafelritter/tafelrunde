// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Nährwertdaten (ADR 0004): statische Datei neben dem Katalog, erst mit
 * den Rezept-Ansichten geladen und vom Service Worker vorgehalten.
 */

import { shallowRef } from 'vue'
import {
  type NutritionData,
  type ParsedRecipe,
  type RecipeIndex,
  type RecipeNutrition,
  EMPTY_NUTRITION,
  buildNutritionData,
  recipeNutrition,
} from '@/core'
import { catalogItem } from './catalog'

export const nutritionData = shallowRef<NutritionData>(EMPTY_NUTRITION)
let loading: Promise<void> | undefined

export function loadNutrition(): Promise<void> {
  loading ??= fetch(`${import.meta.env.BASE_URL}catalog/nutrition.json`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : undefined))
    .then((data) => {
      nutritionData.value = buildNutritionData(data)
    })
    .catch(() => {
      loading = undefined
    })
  return loading
}

/** Nährwerte mit den aktuell geladenen Daten (reaktiv über `nutritionData`). */
export function nutritionOf(
  index: RecipeIndex,
  recipe: ParsedRecipe,
  scope: string,
  factor = 1,
): RecipeNutrition | undefined {
  const data = nutritionData.value
  if (!data.size) return undefined
  return recipeNutrition(index, recipe, scope, data, (n) => catalogItem(n)?.id, factor)
}
