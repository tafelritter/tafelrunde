// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RouteLocationRaw } from 'vue-router'
import type { RecipeEntry } from '@/core'

/** Ziel einer Referenz: eigenes Rezept oder Katalogrezept. */
export function recipeRoute(entry: RecipeEntry): RouteLocationRaw | undefined {
  const own = /^space:([\w-]+)\/([\w-]+)$/.exec(entry.key)
  if (own) return { name: 'recipe', params: { spaceId: own[1]!, recipeId: own[2]! } }
  if (entry.path) return { name: 'catalog-recipe', params: { path: entry.path.split('/') } }
  return undefined
}
