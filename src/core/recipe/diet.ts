// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Ernährungsform (plan/04-phase-2-rezepte.md, 2.7): Ein Rezept erbt die
 * strengste Stufe seiner Zutaten, auch über Referenzen. „Streng“ meint
 * hier: am wenigsten einschränkend – Butter macht aus vegan vegetarisch.
 */

import type { Diet } from '@tafelritter/rezeptformat/basis'
import { normalizeName } from '@tafelritter/rezeptformat/basis'
import type { ParsedRecipe } from '@tafelritter/rezeptformat'
import { type RecipeIndex, resolveReference } from '@tafelritter/rezeptformat'

export const DIET_ORDER: readonly Diet[] = ['vegan', 'vegetarisch', 'pescetarisch', 'omnivor']

export const DIET_LABELS: Record<Diet, string> = {
  vegan: 'vegan',
  vegetarisch: 'vegetarisch',
  pescetarisch: 'mit Fisch',
  omnivor: 'mit Fleisch',
}

export interface DietResult {
  /** Abgeleitete (oder überschriebene) Form; `undefined`, wenn keine Zutat bekannt ist. */
  diet?: Diet
  /** Zutaten ohne bekannte Ernährungsform – die Ableitung ist dann unsicher. */
  unknown: string[]
  overridden: boolean
}

export type DietLookup = (normalizedName: string) => Diet | undefined

/** Zutaten, die keine Rolle spielen (z. B. Wasser, Salz), stehen im Katalog als vegan. */
export function recipeDiet(
  index: RecipeIndex,
  recipe: ParsedRecipe,
  scope: string,
  lookup: DietLookup,
  seen: ReadonlySet<string> = new Set(),
): DietResult {
  if (recipe.meta.diet) return { diet: recipe.meta.diet, unknown: [], overridden: true }
  let level = -1
  const unknown: string[] = []
  for (const ingredient of recipe.ingredients) {
    if (ingredient.reference) {
      const entry = resolveReference(index, ingredient.reference, scope)
      if (!entry || seen.has(entry.key)) {
        unknown.push(ingredient.name)
        continue
      }
      const sub = recipeDiet(
        index,
        entry.recipe,
        entry.scope,
        lookup,
        new Set([...seen, entry.key]),
      )
      if (sub.diet) level = Math.max(level, DIET_ORDER.indexOf(sub.diet))
      unknown.push(...sub.unknown)
      continue
    }
    const diet = lookup(normalizeName(ingredient.name))
    if (diet) level = Math.max(level, DIET_ORDER.indexOf(diet))
    else unknown.push(ingredient.name)
  }
  const result: DietResult = { unknown: [...new Set(unknown)], overridden: false }
  if (level >= 0) result.diet = DIET_ORDER[level]!
  return result
}

/** Passt das Rezept zu einem Filter („vegan“ zeigt nur vegane, „vegetarisch“ vegane und vegetarische …)? */
export function matchesDiet(recipe: Diet | undefined, filter: Diet): boolean {
  return recipe !== undefined && DIET_ORDER.indexOf(recipe) <= DIET_ORDER.indexOf(filter)
}
