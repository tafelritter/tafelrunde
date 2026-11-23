// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Nährwerte je Rezept und Portion (plan/06-phase-4-import-naehrwerte.md, 4.7; ADR 0004).
 *
 * Grundlage sind Werte je 100 g aus dem Bundeslebensmittelschlüssel 4.0 und
 * eine eigene Gewichtstabelle (Stück, EL, Bund …). Was sich nicht in Gramm
 * umrechnen lässt, fließt nicht ein und senkt die angezeigte Abdeckung –
 * geraten wird nicht.
 */

import { normalizeName } from '@tafelritter/rezeptformat/basis'
import { type Amount, unitInfo } from '@tafelritter/rezeptformat/basis'
import type { CatalogIdLookup } from '../model/shopping'
import type { ParsedRecipe } from '@tafelritter/rezeptformat'
import { type RecipeIndex, flattenIngredients } from '@tafelritter/rezeptformat'

export const NUTRIENTS = [
  'kcal',
  'kj',
  'fett',
  'fett_gesaettigt',
  'kohlenhydrate',
  'zucker',
  'ballaststoffe',
  'eiweiss',
  'salz',
] as const
export type NutrientKey = (typeof NUTRIENTS)[number]
export type Nutrients = Record<NutrientKey, number>

/** Anzeige wie in der Nährwerttabelle auf Verpackungen. */
export const NUTRIENT_LABELS: Record<NutrientKey, { label: string; unit: string; sub?: boolean }> =
  {
    kcal: { label: 'Energie', unit: 'kcal' },
    kj: { label: 'Energie', unit: 'kJ' },
    fett: { label: 'Fett', unit: 'g' },
    fett_gesaettigt: { label: 'davon gesättigte Fettsäuren', unit: 'g', sub: true },
    kohlenhydrate: { label: 'Kohlenhydrate', unit: 'g' },
    zucker: { label: 'davon Zucker', unit: 'g', sub: true },
    ballaststoffe: { label: 'Ballaststoffe', unit: 'g' },
    eiweiss: { label: 'Eiweiß', unit: 'g' },
    salz: { label: 'Salz', unit: 'g' },
  }

/** Quellenangabe (CC BY 4.0, ADR 0004). */
export const NUTRITION_ATTRIBUTION = {
  text: 'Nährwerte: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel (BLS) 4.0, Auszug',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.de',
  doiUrl: 'https://doi.org/10.25826/Data20251217-134202-0',
} as const

export interface FoodNutrition {
  /** Je 100 g; `NaN` = kein Wert im BLS (nicht 0). */
  per100: Nutrients
  /** Gramm je Einheit, z. B. `stueck`, `el`, `bund`. */
  weights: Record<string, number>
  /** Dichte in g/ml (für ml, l, EL, TL ohne eigenes Gewicht). */
  density: number
}

export interface NutritionData {
  food(catalogId: string): FoodNutrition | undefined
  /** Allgemeine Einheiten: Volumen in ml oder Gewicht in g. */
  unit(key: string): { ml?: number; g?: number } | undefined
  size: number
}

export const EMPTY_NUTRITION: NutritionData = {
  food: () => undefined,
  unit: () => undefined,
  size: 0,
}

export const zeroNutrients = (): Nutrients =>
  Object.fromEntries(NUTRIENTS.map((k) => [k, 0])) as Nutrients

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Schlüssel einer Einheit: „Stück“ → `stueck`, „EL“ → `el`, „Pck.“ → `pck`, leer → `stueck`. */
export function unitKey(unit: string): string {
  const k = unit
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/\.$/, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
  const SYN: Record<string, string> = {
    '': 'stueck',
    stk: 'stueck',
    st: 'stueck',
    stuecke: 'stueck',
    essloeffel: 'el',
    teeloeffel: 'tl',
    prisen: 'prise',
    messerspitze: 'msp',
    paeckchen: 'pck',
    packung: 'pck',
    dosen: 'dose',
    zehen: 'zehe',
    scheiben: 'scheibe',
    tassen: 'tasse',
    blaetter: 'blatt',
    zweige: 'zweig',
    stangen: 'stange',
    knollen: 'knolle',
    koepfe: 'kopf',
  }
  return SYN[k] ?? k
}

/** Liest `public/catalog/nutrition.json` (nicht vertrauenswürdig: alles wird geprüft). */
export function buildNutritionData(json: unknown): NutritionData {
  const data = (typeof json === 'object' && json !== null ? json : {}) as {
    foods?: unknown
    units?: unknown
  }
  const foods = new Map<string, FoodNutrition>()
  const rawFoods =
    typeof data.foods === 'object' && data.foods !== null
      ? (data.foods as Record<string, unknown>)
      : {}
  for (const [id, value] of Object.entries(rawFoods)) {
    const v = value as { n?: unknown; w?: unknown; d?: unknown } | null
    if (!/^[a-z0-9-]{1,60}$/.test(id) || !Array.isArray(v?.n) || v.n.length !== NUTRIENTS.length)
      continue
    const n = v.n as unknown[]
    if (!n.every((x) => x === null || finite(x)) || !finite(n[0])) continue
    const per100 = Object.fromEntries(
      NUTRIENTS.map((k, i) => [k, n[i] === null ? NaN : (n[i] as number)]),
    ) as Nutrients
    const weights: Record<string, number> = {}
    if (typeof v.w === 'object' && v.w !== null) {
      for (const [k, g] of Object.entries(v.w as Record<string, unknown>))
        if (/^[a-z]{1,20}$/.test(k) && finite(g) && g > 0) weights[k] = g
    }
    const density = finite(v.d) && v.d > 0.1 && v.d < 5 ? v.d : 1
    foods.set(id, { per100, weights, density })
  }
  const units = new Map<string, { ml?: number; g?: number }>()
  const rawUnits =
    typeof data.units === 'object' && data.units !== null
      ? (data.units as Record<string, unknown>)
      : {}
  for (const [k, value] of Object.entries(rawUnits)) {
    const u = value as { ml?: unknown; g?: unknown } | null
    if (!/^[a-z]{1,20}$/.test(k)) continue
    if (finite(u?.ml) && u.ml > 0) units.set(k, { ml: u.ml })
    else if (finite(u?.g) && u.g > 0) units.set(k, { g: u.g })
  }
  return { food: (id) => foods.get(id), unit: (k) => units.get(k), size: foods.size }
}

/** Gewicht einer Menge in Gramm; `undefined`, wenn es sich nicht umrechnen lässt. */
export function gramsOf(
  amount: Amount,
  food: FoodNutrition,
  data: NutritionData,
): number | undefined {
  const value =
    amount.kind === 'number'
      ? amount.value
      : amount.kind === 'range'
        ? (amount.min + amount.max) / 2
        : undefined
  if (value === undefined) return undefined
  const info = unitInfo(amount.unit)
  if (info.base === 'g') return value * info.factor
  if (info.base === 'ml') return value * info.factor * food.density
  const key = unitKey(amount.unit)
  const own = food.weights[key]
  if (own !== undefined) return value * own
  const generic = data.unit(key)
  if (generic?.g !== undefined) return value * generic.g
  if (generic?.ml !== undefined) return value * generic.ml * food.density
  return undefined
}

export interface RecipeNutrition {
  total: Nutrients
  /** Je Portion, falls das Rezept Portionen angibt. */
  perServing?: Nutrients
  servings?: number
  /** Gesamtgewicht der erfassten Zutaten in g. */
  grams: number
  /** Zutaten mit Menge, die eingerechnet sind. */
  counted: number
  /** Zutaten mit Menge, die fehlen (nicht im Katalog, ohne Nährwerte oder Einheit unbekannt). */
  missing: string[]
  /** Zutaten ohne Menge (z. B. „Salz“) – nicht eingerechnet, zählen nicht zur Abdeckung. */
  withoutAmount: string[]
  /** Anteil der erfassten Zutaten (0–1). */
  coverage: number
  /** Nährstoffe, für die bei einzelnen Zutaten kein Wert vorliegt (Summe ist zu niedrig). */
  incomplete: NutrientKey[]
}

/**
 * Nährwerte eines Rezepts, mit aufgelösten Unterrezepten (skaliert nach
 * Ausbeute). Optionale Zutaten bleiben außen vor. `factor` skaliert wie
 * in der Rezeptansicht (gewählte Portionen).
 */
export function recipeNutrition(
  index: RecipeIndex,
  recipe: ParsedRecipe,
  scope: string,
  data: NutritionData,
  lookupId: CatalogIdLookup,
  factor = 1,
): RecipeNutrition {
  const total = zeroNutrients()
  const missing: string[] = []
  const withoutAmount: string[] = []
  const incomplete = new Set<NutrientKey>()
  let counted = 0
  let grams = 0
  for (const item of flattenIngredients(index, recipe, scope, factor)) {
    if (item.optional) continue
    if (!item.amounts.length) {
      withoutAmount.push(item.name)
      continue
    }
    const id = item.reference ? undefined : lookupId(normalizeName(item.name))
    const food = id ? data.food(id) : undefined
    const g = food ? item.amounts.map((a) => gramsOf(a, food, data)) : []
    if (!food || g.some((x) => x === undefined)) {
      missing.push(item.name)
      continue
    }
    const sum = (g as number[]).reduce((a, b) => a + b, 0)
    grams += sum
    counted++
    for (const k of NUTRIENTS) {
      if (Number.isNaN(food.per100[k])) incomplete.add(k)
      else total[k] += (food.per100[k] * sum) / 100
    }
  }
  const result: RecipeNutrition = {
    total,
    grams,
    counted,
    missing: [...new Set(missing)],
    withoutAmount: [...new Set(withoutAmount)],
    coverage: counted + missing.length ? counted / (counted + missing.length) : 0,
    incomplete: NUTRIENTS.filter((k) => incomplete.has(k)),
  }
  if (recipe.meta.servings) {
    const servings = recipe.meta.servings * factor
    result.servings = servings
    result.perServing = Object.fromEntries(
      NUTRIENTS.map((k) => [k, total[k] / servings]),
    ) as Nutrients
  }
  return result
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return Object.fromEntries(NUTRIENTS.map((k) => [k, a[k] + b[k]])) as Nutrients
}
