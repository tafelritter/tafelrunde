// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Einkaufsliste aus Rezepten (plan/05-phase-3-planung.md, 3.3–3.6):
 * Zutaten mehrerer Rezepte sammeln, Unterrezepte nach Wahl auflösen,
 * gleiche Artikel über die Katalog-ID erkennen und Mengen je Größe
 * zusammenfassen. Das Ergebnis ist die Vorschau; übernommen wird mit
 * `addLinesToList`.
 */

import { normalizeName } from '@tafelritter/rezeptformat/basis'
import type { CatalogRef } from '@tafelritter/rezeptformat/basis'
import type { ItemSource, TransferLine } from '../model/shopping'
import { type Amount, sumAmounts } from '@tafelritter/rezeptformat/basis'
import type { ParsedRecipe } from '@tafelritter/rezeptformat'
import { scaleRecipe } from '@tafelritter/rezeptformat'
import { type RecipeIndex, referenceFactor, resolveReference } from '@tafelritter/rezeptformat'

/** Wie ein Unterrezept auf die Liste kommt (3.5). */
export type SubRecipeMode = 'expand' | 'omit' | 'item'

/** Ein Rezept, das eingekauft werden soll. */
export interface ShoppingRequest {
  /** Quelle der Einträge: `p:<planeintrag>` oder `r:<zufall>`. */
  sourceKey: string
  label: string
  recipe: ParsedRecipe
  /** Bereich des Rezepts (für Referenzen) oder `catalog`. */
  scope: string
  factor: number
}

export interface SubRecipeUse {
  /** Schlüssel im Rezept-Index. */
  key: string
  title: string
  /** Titel der Rezepte, die es verwenden. */
  usedBy: string[]
}

export interface ShoppingLine extends TransferLine {
  /** Vergleichsschlüssel: Katalog-ID oder normalisierter Name. */
  key: string
  /** Summe aller Beiträge. */
  amounts: Amount[]
  /** Nur optionale Verwendungen. */
  optional: boolean
  /** Grundvorrat (3.6): standardmäßig nicht ausgewählt. */
  pantry: boolean
  /** Ein Unterrezept als ein Posten (3.5). */
  recipe: boolean
}

export interface BuildOptions {
  /** Wahl je Unterrezept (Schlüssel im Index); Standard: auflösen. */
  modes?: ReadonlyMap<string, SubRecipeMode>
  /** Katalog-ID und Anzeigename zu einem normalisierten Namen. */
  catalog?: (normalizedName: string) => CatalogRef | undefined
  /** Gehört die Zutat zu den Grundvorräten? */
  isPantry?: (name: string, catalogId?: string) => boolean
}

const MAX_DEPTH = 8

interface Use {
  name: string
  amount?: Amount
  optional: boolean
  recipe: boolean
}

function walk(
  index: RecipeIndex,
  recipe: ParsedRecipe,
  scope: string,
  factor: number,
  modes: ReadonlyMap<string, SubRecipeMode>,
  visit: {
    use?: (use: Use) => void
    sub?: (key: string, title: string) => void
  },
  optional = false,
  depth = 0,
  seen: ReadonlySet<string> = new Set(),
): void {
  for (const i of scaleRecipe(recipe, factor).ingredients) {
    if (i.hidden) continue
    const opt = optional || i.optional
    const base: Use = { name: i.name, optional: opt, recipe: false }
    if (i.amount) base.amount = i.amount
    if (!i.reference) {
      visit.use?.(base)
      continue
    }
    const entry = resolveReference(index, i.reference, scope)
    if (!entry || depth >= MAX_DEPTH || seen.has(entry.key)) {
      visit.use?.({ ...base, recipe: true })
      continue
    }
    const title = entry.recipe.meta.title || i.name
    visit.sub?.(entry.key, title)
    const mode = modes.get(entry.key) ?? 'expand'
    if (mode === 'omit') continue
    if (mode === 'item') {
      visit.use?.({ ...base, name: title, recipe: true })
      continue
    }
    const sub = referenceFactor(i.amount, entry.recipe) ?? 1
    walk(
      index,
      entry.recipe,
      entry.scope,
      sub,
      modes,
      visit,
      opt,
      depth + 1,
      new Set([...seen, entry.key]),
    )
  }
}

/** Unterrezepte, die beim Auflösen vorkommen – für die Rückfrage „schon vorhanden?“. */
export function findSubRecipes(
  index: RecipeIndex,
  requests: readonly ShoppingRequest[],
  modes: ReadonlyMap<string, SubRecipeMode> = new Map(),
): SubRecipeUse[] {
  const byKey = new Map<string, SubRecipeUse>()
  for (const r of requests) {
    walk(index, r.recipe, r.scope, r.factor, modes, {
      sub: (key, title) => {
        const use = byKey.get(key) ?? { key, title, usedBy: [] }
        byKey.set(key, use)
        if (!use.usedBy.includes(r.label)) use.usedBy.push(r.label)
      },
    })
  }
  return [...byKey.values()]
}

/** Baut die Vorschau: eine Zeile je Artikel mit Herkunft je Rezept. */
export function buildShoppingLines(
  index: RecipeIndex,
  requests: readonly ShoppingRequest[],
  options: BuildOptions = {},
): ShoppingLine[] {
  const modes = options.modes ?? new Map()
  const lines = new Map<string, ShoppingLine & { bySource: Map<string, ItemSource> }>()
  for (const r of requests) {
    walk(index, r.recipe, r.scope, r.factor, modes, {
      use: (use) => {
        const normalized = normalizeName(use.name)
        const ref = use.recipe ? undefined : options.catalog?.(normalized)
        const key = ref ? `id:${ref.id}` : `name:${normalized}`
        let line = lines.get(key)
        if (!line) {
          line = {
            key,
            name: ref?.name ?? use.name,
            amounts: [],
            sources: [],
            optional: use.optional,
            pantry: !use.recipe && (options.isPantry?.(use.name, ref?.id) ?? false),
            recipe: use.recipe,
            bySource: new Map(),
          }
          if (ref) line.catalogId = ref.id
          lines.set(key, line)
        } else line.optional &&= use.optional
        let source = line.bySource.get(r.sourceKey)
        if (!source) {
          source = { key: r.sourceKey, label: r.label, amounts: [] }
          line.bySource.set(r.sourceKey, source)
          line.sources.push(source)
        }
        if (use.amount) source.amounts = sumAmounts([...source.amounts, use.amount])
      },
    })
  }
  const collator = new Intl.Collator('de-DE', { sensitivity: 'base' })
  return [...lines.values()]
    .map((line): ShoppingLine => {
      const { bySource, ...rest } = line
      void bySource
      return { ...rest, amounts: sumAmounts(rest.sources.flatMap((s) => s.amounts)) }
    })
    .sort((a, b) => collator.compare(a.name, b.name))
}
