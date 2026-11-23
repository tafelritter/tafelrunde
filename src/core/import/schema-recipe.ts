// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * schema.org/Recipe lesen (plan/06-phase-4-import-naehrwerte.md, 4.1).
 * Eingabe sind die JSON-LD-Blöcke einer Seite oder ein Objekt, das das
 * Bookmarklet aus Microdata gebaut hat – beides nicht vertrauenswürdig.
 */

import { type ImportedRecipe, plainText, safeSourceUrl } from './imported-recipe'

type Json = Record<string, unknown>

const MAX_DEPTH = 6
const MAX_LINES = 150

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function isRecipe(node: Json): boolean {
  const type = node['@type']
  const types = Array.isArray(type) ? type : [type]
  return types.some((t) => typeof t === 'string' && /(^|[/#:])Recipe$/.test(t))
}

/** Sucht das erste Rezept in JSON-LD (auch in `@graph`, Listen und `mainEntity`). */
export function findRecipeNode(data: unknown, depth = 0): Json | undefined {
  if (depth > MAX_DEPTH) return undefined
  if (Array.isArray(data)) {
    for (const item of data.slice(0, 100)) {
      const found = findRecipeNode(item, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (!isObject(data)) return undefined
  if (isRecipe(data)) return data
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const found = findRecipeNode(data[key], depth + 1)
    if (found) return found
  }
  return undefined
}

/** ISO-8601-Dauer wie „PT1H30M“ oder „P0DT0H20M“ in Minuten. */
export function isoMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+)S)?)?$/i.exec(
    value.trim(),
  )
  if (!m) return undefined
  const minutes =
    Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60
  return minutes > 0 && minutes < 100_000 ? Math.round(minutes) : undefined
}

function texts(value: unknown, max = MAX_LINES): string[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return list
    .slice(0, max)
    .flatMap((v) => {
      if (typeof v === 'string') return plainText(v, 500).split('\n')
      if (isObject(v)) return [plainText(v.name ?? v.text, 500)]
      return []
    })
    .map((s) => s.trim())
    .filter(Boolean)
}

function steps(value: unknown, section?: string, depth = 0): ImportedRecipe['steps'] {
  if (depth > 3) return []
  if (typeof value === 'string') {
    return plainText(value, 20_000)
      .split(/\n+/)
      .map((t) => t.replace(/^\d+[.)]\s+/, '').trim())
      .filter(Boolean)
      .map((text) => (section ? { section, text } : { text }))
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_LINES).flatMap((v) => steps(v, section, depth + 1))
  }
  if (!isObject(value)) return []
  const type = typeof value['@type'] === 'string' ? value['@type'] : ''
  if (/HowToSection$/.test(type) || Array.isArray(value.itemListElement)) {
    const name = plainText(value.name, 100) || section
    return steps(value.itemListElement, name, depth + 1)
  }
  const text = plainText(value.text ?? value.name ?? value.description, 5000)
  return text ? [section ? { section, text } : { text }] : []
}

function servingsOf(value: unknown): { servings?: number; yield?: string } {
  const list = Array.isArray(value) ? value : [value]
  for (const v of list) {
    const text = typeof v === 'number' ? String(v) : plainText(v, 100)
    const m =
      /^\s*(\d+(?:[.,]\d+)?)\s*(portion(en)?|personen|person|servings?|stück|stk\.?)?\s*$/i.exec(
        text,
      )
    if (m) {
      const n = Number(m[1]!.replace(',', '.'))
      if (n > 0 && n <= 1000) return { servings: n }
    }
  }
  const first = list
    .map((v) => (typeof v === 'number' ? String(v) : plainText(v, 100)))
    .find(Boolean)
  return first ? { yield: first } : {}
}

/** Liest ein Rezept-Objekt; `pageUrl` ist die Adresse der Seite als Quelle. */
export function readSchemaRecipe(node: Json, pageUrl?: string): ImportedRecipe {
  const recipe: ImportedRecipe = {
    title: plainText(node.name ?? node.headline, 200) || 'Importiertes Rezept',
    ingredients: texts(node.recipeIngredient ?? node.ingredients),
    steps: steps(node.recipeInstructions),
    tags: [],
  }
  const description = plainText(node.description, 1000)
  if (description) recipe.description = description.replace(/\n+/g, ' ')
  Object.assign(recipe, servingsOf(node.recipeYield))
  const prep = isoMinutes(node.prepTime)
  const cook = isoMinutes(node.cookTime)
  const total = isoMinutes(node.totalTime)
  if (prep) recipe.prepMinutes = prep
  if (cook) recipe.cookMinutes = cook
  if (!prep && !cook && total) recipe.prepMinutes = total
  const keywords =
    typeof node.keywords === 'string' ? node.keywords.split(',') : texts(node.keywords, 30)
  const categories = texts(node.recipeCategory, 5)
  recipe.tags = [
    ...new Set([...categories, ...keywords].map((k) => plainText(k, 40)).filter(Boolean)),
  ].slice(0, 10)
  const source = safeSourceUrl(pageUrl) ?? safeSourceUrl(node.url)
  if (source) recipe.source = source
  return recipe
}

/** Aus den JSON-LD-Texten einer Seite; ungültiges JSON wird übersprungen. */
export function recipeFromJsonLd(
  blocks: readonly string[],
  pageUrl?: string,
): ImportedRecipe | undefined {
  for (const block of blocks.slice(0, 50)) {
    let data: unknown
    try {
      data = JSON.parse(block.slice(0, 2_000_000))
    } catch {
      continue
    }
    const node = findRecipeNode(data)
    if (node) return readSchemaRecipe(node, pageUrl)
  }
  return undefined
}
