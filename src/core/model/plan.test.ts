// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  addDays,
  addPantryItem,
  addPlanEntry,
  dateRange,
  getMeals,
  getPantry,
  getPlanEntries,
  getPlanEntry,
  isPantryItem,
  isPlanDate,
  movePlanEntry,
  planEntriesBetween,
  planIdeas,
  removePantryItem,
  removePlanEntry,
  setMeals,
  setPlanStatus,
  updatePlanEntry,
  weekStart,
} from './plan'

const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
}

describe('Datum', () => {
  it('rechnet auf Kalendertagen', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(weekStart('2026-11-23')).toBe('2026-11-23') // Montag
    expect(weekStart('2026-11-29')).toBe('2026-11-23') // Sonntag
    expect(dateRange('2026-11-23', '2026-11-25')).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
    ])
  })

  it('erkennt ungültige Daten', () => {
    expect(isPlanDate('2026-02-29')).toBe(false)
    expect(isPlanDate('2028-02-29')).toBe(true)
    expect(isPlanDate('morgen')).toBe(false)
  })
})

describe('Mahlzeiten', () => {
  it('hat Abendessen als Standard und lässt sich festlegen', () => {
    const doc = new Y.Doc()
    expect(getMeals(doc).map((m) => m.name)).toEqual(['Abendessen'])
    const meals = setMeals(doc, [{ name: ' Mittag ' }, { id: 'abend', name: 'Abendessen' }])
    expect(getMeals(doc)).toEqual(meals)
    expect(meals[0]!.name).toBe('Mittag')
    expect(() => setMeals(doc, [{ name: ' ' }])).toThrow()
  })
})

describe('Planeinträge', () => {
  it('legt an, verschiebt, ändert und entfernt', () => {
    const doc = new Y.Doc()
    const id = addPlanEntry(
      doc,
      { title: 'Pizza', date: '2026-11-24', recipeKey: 'space:a/1', servings: 4 },
      'p1',
      10,
    )
    expect(getPlanEntry(doc, id)).toMatchObject({
      title: 'Pizza',
      date: '2026-11-24',
      meal: 'abend',
      servings: 4,
      status: 'planned',
    })
    movePlanEntry(doc, id, undefined)
    expect(planIdeas(doc).map((e) => e.id)).toEqual([id])
    movePlanEntry(doc, id, '2026-11-26', 'mittag')
    expect(planEntriesBetween(doc, '2026-11-23', '2026-11-29')[0]).toMatchObject({
      date: '2026-11-26',
      meal: 'mittag',
    })
    updatePlanEntry(doc, id, { servings: 6, note: 'mit Salat' })
    expect(getPlanEntry(doc, id)).toMatchObject({ servings: 6, note: 'mit Salat' })
    updatePlanEntry(doc, id, { servings: undefined })
    expect(getPlanEntry(doc, id)?.servings).toBeUndefined()
    setPlanStatus(doc, id, 'cooked', 99)
    expect(getPlanEntry(doc, id)).toMatchObject({ status: 'cooked', cookedAt: 99 })
    removePlanEntry(doc, id)
    expect(getPlanEntries(doc)).toEqual([])
  })

  it('lehnt ungültige Eingaben ab', () => {
    const doc = new Y.Doc()
    expect(() => addPlanEntry(doc, { title: ' ' }, 'p1')).toThrow()
    expect(() => addPlanEntry(doc, { title: 'X', date: '24.11.' }, 'p1')).toThrow()
  })

  it('führt Verschieben und Portionen von zwei Geräten zusammen', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    const id = addPlanEntry(a, { title: 'Suppe', date: '2026-11-24', servings: 2 }, 'p1')
    sync(a, b)
    movePlanEntry(a, id, '2026-11-25')
    updatePlanEntry(b, id, { servings: 5 })
    sync(a, b)
    expect(getPlanEntry(a, id)).toMatchObject({ date: '2026-11-25', servings: 5 })
    expect(getPlanEntry(b, id)).toEqual(getPlanEntry(a, id))
  })
})

describe('Grundvorräte', () => {
  it('erkennt Zutaten über Katalog-ID oder Namen', () => {
    const doc = new Y.Doc()
    addPantryItem(doc, 'Salz', 'salz')
    addPantryItem(doc, 'Hausgewürz')
    expect(isPantryItem(doc, 'Meersalz', 'salz')).toBe(true)
    expect(isPantryItem(doc, ' hausgewürz ')).toBe(true)
    expect(isPantryItem(doc, 'Pfeffer', 'pfeffer')).toBe(false)
    expect(getPantry(doc).map((p) => p.name)).toEqual(['Hausgewürz', 'Salz'])
    removePantryItem(doc, getPantry(doc)[1]!.key)
    expect(isPantryItem(doc, 'Salz', 'salz')).toBe(false)
  })
})
