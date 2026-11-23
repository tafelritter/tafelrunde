// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Wochenplan im Dokument `live` (plan/05-phase-3-planung.md, 3.1, 3.2, 3.6).
 *
 * Jeder Planeintrag ist eine eigene `Y.Map`: Verschieben auf einem Gerät und
 * gleichzeitiges Ändern der Portionen auf einem anderen gehen beide durch.
 * Einträge ohne Datum bilden den Ideen-Pool.
 */

import * as Y from 'yjs'
import { normalizeName } from '@tafelritter/rezeptformat/basis'
import { randomId } from '../crypto/ids'
import { LIVE_ROOT } from './space'

export type PlanStatus = 'planned' | 'cooked'

export interface PlanEntry {
  id: string
  /** Kalendertag `YYYY-MM-DD`; fehlt im Ideen-Pool. */
  date?: string
  /** ID der Mahlzeit (siehe `getMeals`). */
  meal: string
  /** Rezept-Schlüssel wie im Rezept-Index (`space:<bereich>/<id>` oder `catalog:<pfad>`). */
  recipeKey?: string
  /** Titel zum Zeitpunkt der Planung; Anzeige, falls das Rezept fehlt, oder freier Eintrag. */
  title: string
  servings?: number
  note: string
  status: PlanStatus
  cookedAt?: number
  createdAt: number
  createdBy: string
}

export type PlanEntryInput = Pick<PlanEntry, 'title'> &
  Partial<Pick<PlanEntry, 'date' | 'meal' | 'recipeKey' | 'servings' | 'note'>>

export interface Meal {
  id: string
  name: string
}

/** Ohne eigene Festlegung plant ein Haushalt nur das Abendessen. */
export const DEFAULT_MEALS: readonly Meal[] = [{ id: 'abend', name: 'Abendessen' }]

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_TITLE = 120
const MAX_NOTE = 500

const plan = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(LIVE_ROOT.plan)
const settings = (doc: Y.Doc) => doc.getMap<unknown>(LIVE_ROOT.planSettings)
const pantry = (doc: Y.Doc) => doc.getMap<unknown>(LIVE_ROOT.pantry)

export function isPlanDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value)
}

// --- Datum ------------------------------------------------------------------

/** Kalendertag in lokaler Zeit. */
export function toPlanDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** Rechnet auf Kalendertagen (ohne Sommerzeit-Sprünge). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Montag der Woche, in der `date` liegt. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((day + 6) % 7))
}

/** Alle Tage von `from` bis einschließlich `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 366; d = addDays(d, 1)) out.push(d)
  return out
}

// --- Mahlzeiten -------------------------------------------------------------

export function getMeals(doc: Y.Doc): Meal[] {
  const value = settings(doc).get('meals')
  const meals = Array.isArray(value)
    ? (value as unknown[]).flatMap((m) => {
        const o = m as Partial<Meal> | null
        return typeof o?.id === 'string' && typeof o.name === 'string' && o.name.trim()
          ? [{ id: o.id, name: o.name }]
          : []
      })
    : []
  return meals.length ? meals : [...DEFAULT_MEALS]
}

/** Legt die Mahlzeiten des Haushalts fest (Reihenfolge = Anzeige). */
export function setMeals(doc: Y.Doc, meals: readonly { id?: string; name: string }[]): Meal[] {
  const seen = new Set<string>()
  const clean = meals.flatMap((m) => {
    const name = m.name.replace(/\s+/g, ' ').trim().slice(0, 40)
    const id = m.id && /^[\w-]{1,40}$/.test(m.id) ? m.id : randomId()
    if (!name || seen.has(id)) return []
    seen.add(id)
    return [{ id, name }]
  })
  if (!clean.length) throw new Error('Mindestens eine Mahlzeit nötig')
  settings(doc).set('meals', clean)
  return clean
}

// --- Planeinträge -----------------------------------------------------------

function cleanTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
  if (!t) throw new Error('Titel darf nicht leer sein')
  return t
}

function cleanServings(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return Math.min(100, Math.round(value * 100) / 100)
}

function readEntry(id: string, m: Y.Map<unknown>): PlanEntry {
  const str = (k: string) => {
    const v = m.get(k)
    return typeof v === 'string' ? v : ''
  }
  const num = (k: string) => {
    const v = m.get(k)
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }
  const entry: PlanEntry = {
    id,
    meal: str('meal') || DEFAULT_MEALS[0]!.id,
    title: str('title'),
    note: str('note'),
    status: m.get('status') === 'cooked' ? 'cooked' : 'planned',
    createdAt: num('createdAt') ?? 0,
    createdBy: str('createdBy'),
  }
  const date = m.get('date')
  if (isPlanDate(date)) entry.date = date
  const recipeKey = str('recipeKey')
  if (recipeKey) entry.recipeKey = recipeKey
  const servings = cleanServings(num('servings'))
  if (servings !== undefined) entry.servings = servings
  const cookedAt = num('cookedAt')
  if (entry.status === 'cooked' && cookedAt !== undefined) entry.cookedAt = cookedAt
  return entry
}

export function addPlanEntry(
  doc: Y.Doc,
  input: PlanEntryInput,
  by: string,
  now = Date.now(),
): string {
  const id = randomId()
  const m = new Y.Map<unknown>()
  doc.transact(() => {
    plan(doc).set(id, m)
    m.set('title', cleanTitle(input.title))
    m.set('meal', input.meal ?? getMeals(doc)[0]!.id)
    if (input.date !== undefined) {
      if (!isPlanDate(input.date)) throw new Error('ungültiges Datum')
      m.set('date', input.date)
    }
    if (input.recipeKey) m.set('recipeKey', input.recipeKey)
    const servings = cleanServings(input.servings)
    if (servings !== undefined) m.set('servings', servings)
    m.set('note', (input.note ?? '').trim().slice(0, MAX_NOTE))
    m.set('status', 'planned')
    m.set('createdAt', now)
    m.set('createdBy', by)
  })
  return id
}

export function getPlanEntry(doc: Y.Doc, id: string): PlanEntry | undefined {
  const m = plan(doc).get(id)
  return m instanceof Y.Map ? readEntry(id, m) : undefined
}

export function getPlanEntries(doc: Y.Doc): PlanEntry[] {
  const out: PlanEntry[] = []
  plan(doc).forEach((m, id) => {
    if (m instanceof Y.Map) out.push(readEntry(id, m))
  })
  return out.sort(
    (a, b) =>
      (a.date ?? '').localeCompare(b.date ?? '') ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id),
  )
}

/** Einträge von `from` bis einschließlich `to` (ohne Ideen-Pool). */
export function planEntriesBetween(doc: Y.Doc, from: string, to: string): PlanEntry[] {
  return getPlanEntries(doc).filter((e) => e.date !== undefined && e.date >= from && e.date <= to)
}

/** Ideen-Pool: Einträge ohne Datum. */
export function planIdeas(doc: Y.Doc): PlanEntry[] {
  return getPlanEntries(doc).filter((e) => e.date === undefined)
}

export function updatePlanEntry(
  doc: Y.Doc,
  id: string,
  patch: { title?: string; servings?: number | undefined; note?: string },
): void {
  const m = plan(doc).get(id)
  if (!m) return
  doc.transact(() => {
    if (patch.title !== undefined) m.set('title', cleanTitle(patch.title))
    if ('servings' in patch) {
      const servings = cleanServings(patch.servings)
      if (servings === undefined) m.delete('servings')
      else if (servings !== m.get('servings')) m.set('servings', servings)
    }
    if (patch.note !== undefined) m.set('note', patch.note.trim().slice(0, MAX_NOTE))
  })
}

/** Verschiebt auf einen Tag und eine Mahlzeit; ohne Datum in den Ideen-Pool. */
export function movePlanEntry(
  doc: Y.Doc,
  id: string,
  date: string | undefined,
  meal?: string,
): void {
  const m = plan(doc).get(id)
  if (!m) return
  if (date !== undefined && !isPlanDate(date)) throw new Error('ungültiges Datum')
  doc.transact(() => {
    if (date === undefined) m.delete('date')
    else if (m.get('date') !== date) m.set('date', date)
    if (meal && m.get('meal') !== meal) m.set('meal', meal)
  })
}

export function removePlanEntry(doc: Y.Doc, id: string): void {
  plan(doc).delete(id)
}

export function setPlanStatus(doc: Y.Doc, id: string, status: PlanStatus, now = Date.now()): void {
  const m = plan(doc).get(id)
  if (!m) return
  doc.transact(() => {
    m.set('status', status)
    if (status === 'cooked') m.set('cookedAt', now)
    else m.delete('cookedAt')
  })
}

// --- Grundvorräte (3.6) -------------------------------------------------------

export interface PantryItem {
  /** Katalog-ID oder normalisierter Name. */
  key: string
  name: string
}

/** Schlüssel, unter dem eine Zutat als Grundvorrat geführt wird. */
export function pantryKey(name: string, catalogId?: string): string {
  return catalogId ? `id:${catalogId}` : `name:${normalizeName(name)}`
}

export function addPantryItem(doc: Y.Doc, name: string, catalogId?: string): void {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 100)
  if (!clean) throw new Error('Name darf nicht leer sein')
  pantry(doc).set(pantryKey(clean, catalogId), clean)
}

export function removePantryItem(doc: Y.Doc, key: string): void {
  pantry(doc).delete(key)
}

export function getPantry(doc: Y.Doc): PantryItem[] {
  const out: PantryItem[] = []
  for (const [key, name] of pantry(doc)) {
    if (typeof name === 'string' && /^(id|name):/.test(key)) out.push({ key, name })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

/** Gehört die Zutat zu den Grundvorräten? Prüft Katalog-ID und Namen. */
export function isPantryItem(doc: Y.Doc, name: string, catalogId?: string): boolean {
  const map = pantry(doc)
  return (
    (catalogId !== undefined && map.has(pantryKey(name, catalogId))) || map.has(pantryKey(name))
  )
}
