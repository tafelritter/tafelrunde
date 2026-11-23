// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Dokument `library` eines Bereichs (plan/04-phase-2-rezepte.md, 2.2 und 2.8):
 * Rezepte als Cooklang-Quelltext (`Y.Text`, gemeinsam bearbeitbar), Notizen
 * und Bewertungen je Person, Koch-Protokoll.
 *
 * Notizen, Bewertungen und Protokoll sind flach (`<rezept>/<person>/<feld>`),
 * damit gleichzeitige Einträge verschiedener Personen nichts überschreiben.
 * Rezepte legt immer genau ein Gerät an – dort ist eine eigene `Y.Map` richtig.
 */

import * as Y from 'yjs'
import { isValidId, randomId } from '../crypto/ids'
import { MAX_RECIPE_CHARS } from '@tafelritter/rezeptformat/basis'

export const LIBRARY_ROOT = {
  recipes: 'recipes',
  reviews: 'reviews',
  cooked: 'cooked',
  collections: 'collections',
} as const

/** Herkunft eines übernommenen Rezepts (2.11). */
export interface RecipeOrigin {
  kind: 'catalog' | 'shared'
  /** Katalogpfad oder `<bereich>/<rezept>`. */
  ref: string
  /** Fingerabdruck des Originals zum Zeitpunkt der Übernahme. */
  version: string
}

export interface StoredRecipe {
  id: string
  source: string
  createdAt: number
  updatedAt: number
  createdBy: string
  origin?: RecipeOrigin
}

const recipes = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(LIBRARY_ROOT.recipes)
const reviews = (doc: Y.Doc) => doc.getMap<unknown>(LIBRARY_ROOT.reviews)
const cooked = (doc: Y.Doc) => doc.getMap<unknown>(LIBRARY_ROOT.cooked)
const collections = (doc: Y.Doc) => doc.getMap<unknown>(LIBRARY_ROOT.collections)

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function clampSource(source: string): string {
  return source.length > MAX_RECIPE_CHARS ? source.slice(0, MAX_RECIPE_CHARS) : source
}

export function createRecipe(
  doc: Y.Doc,
  source: string,
  by: string,
  now = Date.now(),
  origin?: RecipeOrigin,
): string {
  const id = randomId()
  const entry = new Y.Map<unknown>()
  const text = new Y.Text()
  doc.transact(() => {
    recipes(doc).set(id, entry)
    entry.set('source', text)
    text.insert(0, clampSource(source))
    entry.set('createdAt', now)
    entry.set('updatedAt', now)
    entry.set('createdBy', by)
    if (origin) entry.set('origin', { ...origin })
  })
  return id
}

/** Der gemeinsam bearbeitbare Quelltext – für den Editor. */
export function recipeText(doc: Y.Doc, id: string): Y.Text | undefined {
  const text = recipes(doc).get(id)?.get('source')
  return text instanceof Y.Text ? text : undefined
}

/** Ersetzt den Quelltext vollständig (Import, Zurücksetzen auf das Original). */
export function replaceRecipeSource(
  doc: Y.Doc,
  id: string,
  source: string,
  now = Date.now(),
): void {
  const text = recipeText(doc, id)
  if (!text) return
  doc.transact(() => {
    text.delete(0, text.length)
    text.insert(0, clampSource(source))
    recipes(doc).get(id)?.set('updatedAt', now)
  })
}

/**
 * Ändert den Quelltext mit möglichst kleiner Änderung (gemeinsamer Anfang und
 * Ende bleiben stehen) – so gehen gleichzeitige Bearbeitungen und die
 * Cursorposition anderer nicht verloren, etwa beim Metadaten-Formular.
 */
export function updateRecipeSource(doc: Y.Doc, id: string, next: string, now = Date.now()): void {
  const text = recipeText(doc, id)
  if (!text) return
  const current = text.toJSON()
  const target = clampSource(next)
  if (current === target) return
  let start = 0
  while (start < current.length && start < target.length && current[start] === target[start])
    start++
  let end = 0
  while (
    end < current.length - start &&
    end < target.length - start &&
    current[current.length - 1 - end] === target[target.length - 1 - end]
  ) {
    end++
  }
  doc.transact(() => {
    text.delete(start, current.length - start - end)
    text.insert(start, target.slice(start, target.length - end))
    recipes(doc).get(id)?.set('updatedAt', now)
  })
}

export function touchRecipe(doc: Y.Doc, id: string, now = Date.now()): void {
  recipes(doc).get(id)?.set('updatedAt', now)
}

export function deleteRecipe(doc: Y.Doc, id: string): void {
  doc.transact(() => {
    recipes(doc).delete(id)
    for (const map of [reviews(doc), cooked(doc)]) {
      for (const key of [...map.keys()]) if (key.startsWith(`${id}/`)) map.delete(key)
    }
    for (const key of [...collections(doc).keys()]) {
      if (key.endsWith(`/r/${id}`)) collections(doc).delete(key)
    }
  })
}

function readOrigin(value: unknown): RecipeOrigin | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const o = value as Record<string, unknown>
  if ((o.kind !== 'catalog' && o.kind !== 'shared') || typeof o.ref !== 'string') return undefined
  return { kind: o.kind, ref: o.ref, version: typeof o.version === 'string' ? o.version : '' }
}

export function setRecipeOrigin(doc: Y.Doc, id: string, origin: RecipeOrigin | undefined): void {
  const entry = recipes(doc).get(id)
  if (!entry) return
  if (origin) entry.set('origin', { ...origin })
  else entry.delete('origin')
}

export function getRecipe(doc: Y.Doc, id: string): StoredRecipe | undefined {
  const entry = recipes(doc).get(id)
  const text = recipeText(doc, id)
  if (!entry || !text) return undefined
  const recipe: StoredRecipe = {
    id,
    source: text.toJSON(),
    createdAt: num(entry.get('createdAt')),
    updatedAt: num(entry.get('updatedAt')),
    createdBy: typeof entry.get('createdBy') === 'string' ? (entry.get('createdBy') as string) : '',
  }
  const origin = readOrigin(entry.get('origin'))
  if (origin) recipe.origin = origin
  return recipe
}

export function listRecipes(doc: Y.Doc): StoredRecipe[] {
  const out: StoredRecipe[] = []
  for (const id of recipes(doc).keys()) {
    const r = getRecipe(doc, id)
    if (r) out.push(r)
  }
  return out
}

// --- Notizen und Bewertungen (2.8) --------------------------------------------

export interface Review {
  personId: string
  stars?: number
  note?: string
  updatedAt: number
}

export function setReview(
  doc: Y.Doc,
  recipeId: string,
  personId: string,
  patch: { stars?: number | null; note?: string },
  now = Date.now(),
): void {
  if (!isValidId(recipeId) || !isValidId(personId)) throw new Error('ungültige ID')
  const map = reviews(doc)
  const k = (f: string) => `${recipeId}/${personId}/${f}`
  doc.transact(() => {
    if (patch.stars === null) map.delete(k('stars'))
    else if (patch.stars !== undefined) {
      map.set(k('stars'), Math.min(5, Math.max(1, Math.round(patch.stars))))
    }
    if (patch.note !== undefined) {
      const note = patch.note.trim().slice(0, 5000)
      if (note) map.set(k('note'), note)
      else map.delete(k('note'))
    }
    map.set(k('updatedAt'), now)
  })
}

export function getReviews(doc: Y.Doc, recipeId: string): Review[] {
  const byPerson = new Map<string, Review>()
  for (const [key, value] of reviews(doc)) {
    const [rid, personId, field] = key.split('/')
    if (rid !== recipeId || !personId || !isValidId(personId)) continue
    const review = byPerson.get(personId) ?? { personId, updatedAt: 0 }
    byPerson.set(personId, review)
    if (field === 'stars' && typeof value === 'number' && value >= 1 && value <= 5)
      review.stars = value
    else if (field === 'note' && typeof value === 'string') review.note = value
    else if (field === 'updatedAt') review.updatedAt = num(value)
  }
  return [...byPerson.values()].filter((r) => r.stars !== undefined || r.note !== undefined)
}

export function averageStars(reviewList: readonly Review[]): number | undefined {
  const stars = reviewList.flatMap((r) => (r.stars ? [r.stars] : []))
  return stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : undefined
}

// --- Koch-Protokoll -------------------------------------------------------------

export interface CookedEntry {
  id: string
  recipeId: string
  personId: string
  at: number
}

export function logCooked(
  doc: Y.Doc,
  recipeId: string,
  personId: string,
  now = Date.now(),
): string {
  const id = randomId()
  cooked(doc).set(`${recipeId}/${id}`, { personId, at: now })
  return id
}

export function cookedLog(doc: Y.Doc, recipeId?: string): CookedEntry[] {
  const out: CookedEntry[] = []
  for (const [key, value] of cooked(doc)) {
    const [rid, id] = key.split('/')
    if (!rid || !id || (recipeId && rid !== recipeId)) continue
    const v = value as { personId?: unknown; at?: unknown } | null
    if (typeof v?.personId !== 'string' || typeof v.at !== 'number') continue
    out.push({ id, recipeId: rid, personId: v.personId, at: v.at })
  }
  return out.sort((a, b) => b.at - a.at)
}

export function lastCooked(doc: Y.Doc, recipeId: string): number | undefined {
  return cookedLog(doc, recipeId)[0]?.at
}

// --- Sammlungen (2.6) -------------------------------------------------------------

export interface Collection {
  id: string
  name: string
  recipeIds: string[]
}

export function createCollection(doc: Y.Doc, name: string): string {
  const id = randomId()
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 60)
  if (!trimmed) throw new Error('Name darf nicht leer sein')
  collections(doc).set(`${id}/name`, trimmed)
  return id
}

export function renameCollection(doc: Y.Doc, id: string, name: string): void {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, 60)
  if (trimmed && collections(doc).has(`${id}/name`)) collections(doc).set(`${id}/name`, trimmed)
}

export function deleteCollection(doc: Y.Doc, id: string): void {
  doc.transact(() => {
    for (const key of [...collections(doc).keys()])
      if (key.startsWith(`${id}/`)) collections(doc).delete(key)
  })
}

export function setInCollection(
  doc: Y.Doc,
  collectionId: string,
  recipeId: string,
  member: boolean,
): void {
  if (!isValidId(recipeId) || !collections(doc).has(`${collectionId}/name`)) return
  const key = `${collectionId}/r/${recipeId}`
  if (member) collections(doc).set(key, true)
  else collections(doc).delete(key)
}

export function listCollections(doc: Y.Doc): Collection[] {
  const byId = new Map<string, Collection>()
  const get = (id: string) => {
    let c = byId.get(id)
    if (!c) byId.set(id, (c = { id, name: '', recipeIds: [] }))
    return c
  }
  for (const [key, value] of collections(doc)) {
    const [id, field, recipeId] = key.split('/')
    if (!id || !isValidId(id)) continue
    if (field === 'name' && typeof value === 'string') get(id).name = value
    else if (field === 'r' && recipeId && value === true) get(id).recipeIds.push(recipeId)
  }
  // Sammlungen ohne Namen sind Reste gelöschter Sammlungen (gleichzeitige Bearbeitung).
  return [...byId.values()].filter((c) => c.name).sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
