// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Suche, Filter und Sortierung für Rezepte (plan/04-phase-2-rezepte.md, 2.6).
 * Volltext mit MiniSearch: Titel, Tags, Zutaten, Beschreibung und Text,
 * mit Präfix- und unscharfer Suche (Tippfehler).
 */

import MiniSearch from 'minisearch'
import type { Diet } from '@tafelritter/rezeptformat/basis'
import { matchesDiet } from './diet'
import type { ParsedRecipe } from '@tafelritter/rezeptformat'

export interface SearchableRecipe {
  key: string
  recipe: ParsedRecipe
  diet?: Diet | undefined
  stars?: number | undefined
  lastCooked?: number | undefined
  createdAt: number
  collections?: string[]
  /** Kalorien je Portion (Näherung), falls berechenbar. */
  kcal?: number | undefined
}

export type RecipeSort = 'name' | 'rating' | 'cooked' | 'time' | 'kcal' | 'newest'

export const SORT_LABELS: Record<RecipeSort, string> = {
  name: 'Name',
  rating: 'Bewertung',
  cooked: 'Zuletzt gekocht',
  time: 'Zubereitungszeit',
  kcal: 'Kalorien je Portion',
  newest: 'Neueste',
}

export interface RecipeFilter {
  query?: string
  tags?: string[]
  diet?: Diet
  maxMinutes?: number
  /** Höchstens so viele kcal je Portion; Rezepte ohne Nährwerte fallen heraus. */
  maxKcal?: number
  collection?: string
}

const totalMinutes = (r: ParsedRecipe) => (r.meta.prepMinutes ?? 0) + (r.meta.cookMinutes ?? 0)

function stepText(r: ParsedRecipe): string {
  return r.sections
    .flatMap((s) => [
      s.name,
      ...s.blocks.map((b) =>
        b.type === 'note'
          ? b.text
          : b.tokens
              .map((t) => (t.type === 'text' ? t.text : t.type === 'ingredient' ? t.display : ''))
              .join(''),
      ),
    ])
    .join(' ')
}

/** Deutsche Umlaute und ß für die Suche angleichen („Kase“ findet „Käse“). */
function fold(term: string): string {
  return term.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss')
}

export function createRecipeSearch(items: readonly SearchableRecipe[]) {
  const search = new MiniSearch<{
    id: string
    title: string
    tags: string
    ingredients: string
    text: string
  }>({
    fields: ['title', 'tags', 'ingredients', 'text'],
    processTerm: (term) => fold(term) || null,
    searchOptions: {
      boost: { title: 3, tags: 2, ingredients: 2 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    },
  })
  search.addAll(
    items.map((i) => ({
      id: i.key,
      title: i.recipe.meta.title,
      tags: i.recipe.meta.tags.join(' '),
      ingredients: i.recipe.ingredients.map((x) => x.name).join(' '),
      text: [i.recipe.meta.description ?? '', stepText(i.recipe)].join(' '),
    })),
  )

  return function query(filter: RecipeFilter, sort: RecipeSort = 'name'): SearchableRecipe[] {
    let result = [...items]
    const q = filter.query?.trim()
    let score: Map<string, number> | undefined
    if (q) {
      score = new Map(search.search(q).map((r) => [r.id as string, r.score]))
      result = result.filter((i) => score!.has(i.key))
    }
    if (filter.tags?.length) {
      const wanted = filter.tags.map(fold)
      result = result.filter((i) => {
        const tags = i.recipe.meta.tags.map(fold)
        return wanted.every((t) => tags.includes(t))
      })
    }
    if (filter.diet) result = result.filter((i) => matchesDiet(i.diet, filter.diet!))
    if (filter.maxMinutes) {
      result = result.filter((i) => {
        const t = totalMinutes(i.recipe)
        return t > 0 && t <= filter.maxMinutes!
      })
    }
    if (filter.maxKcal) {
      result = result.filter((i) => i.kcal !== undefined && i.kcal <= filter.maxKcal!)
    }
    if (filter.collection)
      result = result.filter((i) => i.collections?.includes(filter.collection!))

    const byName = (a: SearchableRecipe, b: SearchableRecipe) =>
      a.recipe.meta.title.localeCompare(b.recipe.meta.title, 'de')
    const sorters: Record<RecipeSort, (a: SearchableRecipe, b: SearchableRecipe) => number> = {
      name: byName,
      rating: (a, b) => (b.stars ?? 0) - (a.stars ?? 0) || byName(a, b),
      cooked: (a, b) => (b.lastCooked ?? 0) - (a.lastCooked ?? 0) || byName(a, b),
      time: (a, b) =>
        (totalMinutes(a.recipe) || Infinity) - (totalMinutes(b.recipe) || Infinity) || byName(a, b),
      kcal: (a, b) => (a.kcal ?? Infinity) - (b.kcal ?? Infinity) || byName(a, b),
      newest: (a, b) => b.createdAt - a.createdAt || byName(a, b),
    }
    // Bei einer Suche ohne ausdrückliche Sortierung zählt die Trefferqualität.
    if (score && sort === 'name')
      return result.sort((a, b) => score.get(b.key)! - score.get(a.key)!)
    return result.sort(sorters[sort])
  }
}

/** Alle Tags mit Häufigkeit, für die Filterauswahl. */
export function allTags(items: readonly SearchableRecipe[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const i of items) {
    for (const tag of i.recipe.meta.tags) {
      const key = fold(tag)
      const entry = counts.get(key) ?? { tag, count: 0 }
      entry.count++
      counts.set(key, entry)
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'de'))
}
