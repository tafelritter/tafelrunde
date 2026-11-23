// SPDX-License-Identifier: AGPL-3.0-or-later

/** Gemeinsames für Wochenplan, Rezeptansicht und Vorschau der Einkaufsliste. */

import {
  type ParsedRecipe,
  type PlanEntry,
  type RecipeIndex,
  type ShoppingRequest,
  planSourceKey,
  randomId,
  spaceKind,
  spaceName,
} from '@/core'
import type { SpaceHandle } from '../workspace/workspace'

/** Bereiche mit Plan und Einkaufslisten: persönlich und Haushalte (Haushalte zuerst). */
export function planSpaces(handles: readonly SpaceHandle[]): { id: string; name: string }[] {
  const own = handles.filter((h) => {
    const kind = spaceKind(h.doc)
    return kind === 'personal' || kind === 'household'
  })
  const sorted = [
    ...own.filter((h) => spaceKind(h.doc) === 'household'),
    ...own.filter((h) => spaceKind(h.doc) === 'personal'),
  ]
  return sorted.map((h) => ({
    id: h.record.id,
    name: spaceName(h.doc) || (spaceKind(h.doc) === 'personal' ? 'Persönlich' : 'Haushalt'),
  }))
}

/** Faktor für die gewünschten Portionen; ohne Portionsangabe im Rezept 1. */
export function servingsFactor(recipe: ParsedRecipe, servings: number | undefined): number {
  return recipe.meta.servings && servings ? servings / recipe.meta.servings : 1
}

/** Einkaufsanfrage für einen Planeintrag; `undefined` ohne (auffindbares) Rezept. */
export function planRequest(entry: PlanEntry, index: RecipeIndex): ShoppingRequest | undefined {
  const found = entry.recipeKey && index.entries.find((e) => e.key === entry.recipeKey)
  if (!found) return undefined
  return {
    sourceKey: planSourceKey(entry.id),
    label: found.recipe.meta.title || entry.title,
    recipe: found.recipe,
    scope: found.scope,
    factor: servingsFactor(found.recipe, entry.servings),
  }
}

/** Einkaufsanfrage aus der Rezeptansicht (ohne Bezug zum Plan). */
export function recipeRequest(
  recipe: ParsedRecipe,
  scope: string,
  servings: number | undefined,
): ShoppingRequest {
  return {
    sourceKey: `r:${randomId()}`,
    label: recipe.meta.title || 'Rezept',
    recipe,
    scope,
    factor: servingsFactor(recipe, servings),
  }
}

/** Wochentag und Datum, z. B. „Mo, 23.11.“. */
export function dayLabel(date: string, weekday: 'short' | 'long' = 'short'): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', {
    weekday,
    day: 'numeric',
    month: 'numeric',
  })
}
