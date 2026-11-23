// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Cooklang-Entwurf aus einem importierten Rezept (plan/06-phase-4-import-naehrwerte.md, 4.1):
 * Zutaten werden über den Namen in die Arbeitsschritte gesetzt, die übrigen
 * kommen in einen eigenen Abschnitt. Quelle und Importdatum stehen im Front Matter.
 */

import type { CatalogRef } from '@tafelritter/rezeptformat/basis'
import { normalizeName } from '@tafelritter/rezeptformat/basis'
import { ingredientSnippet, setFrontMatter } from '@tafelritter/rezeptformat'
import { type ParsedIngredientLine, parseIngredientLine } from './ingredient-line'
import type { ImportedRecipe } from './imported-recipe'

export interface DraftIngredient extends ParsedIngredientLine {
  /** Originalzeile. */
  line: string
  /** Im Zutatenkatalog gefunden. */
  catalog?: CatalogRef
  /** In einem Arbeitsschritt untergebracht. */
  placed: boolean
}

export interface RecipeDraft {
  source: string
  ingredients: DraftIngredient[]
}

export interface DraftOptions {
  /** Importdatum `YYYY-MM-DD`. */
  importedAt: string
  catalog?: (normalizedName: string) => CatalogRef | undefined
}

/**
 * Text aus fremder Quelle so entschärfen, dass er in Cooklang nur Text ist:
 * keine Zutaten-, Geschirr- oder Timer-Marken, keine Kommentare, Abschnitte oder Notizen.
 */
export function escapeCooklangText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/@/g, '＠')
    .replace(/#/g, '＃')
    .replace(/~/g, '～')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\[-/g, '[ -')
    .replace(/-\]/g, '- ]')
    .replace(/--/g, '–')
    .trim()
    .replace(/^[>=]+\s*/, '› ')
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Muster, unter denen eine Zutat im Text vorkommen kann: der ganze Name,
 * der Wortstamm („Zwiebeln“ → „Zwiebel…“) und bei mehreren Wörtern das
 * letzte („rote Paprika“ → „Paprika“). Kurze Namen wie „Öl“ nur als ganzes Wort.
 */
function patterns(name: string, catalog?: CatalogRef): RegExp[] {
  const out = new Map<string, boolean>()
  const add = (text: string, prefix: boolean) => {
    const t = text.trim()
    if (t.length >= 2 && !out.has(t)) out.set(t, prefix && t.length >= 4)
  }
  for (const n of [name, catalog?.name ?? '']) {
    add(n, true)
    const stem = n.trim().replace(/(en|n|e|s)$/i, '')
    if (stem.length >= 4) add(stem, true)
    const last = n.trim().split(/\s+/).at(-1) ?? ''
    if (last !== n.trim() && last.length >= 4) {
      add(last, true)
      const lastStem = last.replace(/(en|n|e|s)$/i, '')
      if (lastStem.length >= 4) add(lastStem, true)
    }
  }
  return [...out.entries()]
    .sort(([a], [b]) => b.length - a.length)
    .map(
      ([t, prefix]) =>
        new RegExp(`(?<![\\p{L}])${escapeRegex(t)}${prefix ? '[\\p{L}-]*' : '(?![\\p{L}])'}`, 'iu'),
    )
}

const MARK = (n: number) => `\u0000${n}\u0000`

export function draftCooklang(recipe: ImportedRecipe, options: DraftOptions): RecipeDraft {
  const ingredients: DraftIngredient[] = recipe.ingredients.slice(0, 150).flatMap((line) => {
    const parsed = parseIngredientLine(line)
    if (!parsed.name) return []
    const item: DraftIngredient = { ...parsed, line, placed: false }
    const ref = options.catalog?.(normalizeName(parsed.name))
    if (ref) item.catalog = ref
    return [item]
  })

  const steps = recipe.steps.slice(0, 150).map((s) => ({
    section: s.section ? escapeCooklangText(s.section).replace(/=/g, '') : undefined,
    text: escapeCooklangText(s.text),
  }))

  // Zutaten in den ersten passenden Schritt setzen
  ingredients.forEach((ing, n) => {
    for (const re of patterns(ing.name, ing.catalog)) {
      const step = steps.find((s) => re.test(s.text))
      if (step) {
        step.text = step.text.replace(re, MARK(n))
        ing.placed = true
        return
      }
    }
  })

  const snippet = (ing: DraftIngredient) =>
    ingredientSnippet({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      optional: ing.optional,
      note: ing.note,
    })

  const expand = (text: string) =>
    text.replace(/\u0000(\d+)\u0000/g, (_, n: string) => snippet(ingredients[Number(n)]!))

  const body: string[] = []
  const unplaced = ingredients.filter((i) => !i.placed)
  if (unplaced.length) {
    body.push('== Zutaten ==', '', `Bereitstellen: ${unplaced.map(snippet).join(', ')}.`, '')
    if (steps.length && !steps[0]!.section) body.push('== Zubereitung ==', '')
  }
  let section: string | undefined
  for (const step of steps) {
    if (step.section && step.section !== section) {
      body.push(`== ${step.section} ==`, '')
      section = step.section
    }
    body.push(expand(step.text), '')
  }

  const front: Parameters<typeof setFrontMatter>[1] = {
    title: escapeCooklangText(recipe.title).slice(0, 200),
    tags: recipe.tags.map((t) => escapeCooklangText(t).replace(/,/g, ' ')).filter(Boolean),
  }
  if (recipe.servings) front.servings = String(recipe.servings)
  else if (recipe.yield && /^\d/.test(recipe.yield)) front.yield = recipe.yield
  if (recipe.prepMinutes) front['time.prep'] = `${recipe.prepMinutes} min`
  if (recipe.cookMinutes) front['time.cook'] = `${recipe.cookMinutes} min`
  if (recipe.source) front.source = recipe.source
  if (recipe.description) front.description = escapeCooklangText(recipe.description).slice(0, 500)
  let source = setFrontMatter(`${body.join('\n').trim()}\n`, front)
  // Importdatum als eigenes Feld (4.1); bleibt beim Bearbeiten erhalten.
  source = source.replace(/\n---\n/, `\nimported: ${options.importedAt}\n---\n`)
  return { source, ingredients }
}
