// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  averageStars,
  createCollection,
  deleteCollection,
  listCollections,
  renameCollection,
  setInCollection,
  cookedLog,
  createRecipe,
  deleteRecipe,
  getRecipe,
  getReviews,
  lastCooked,
  listRecipes,
  logCooked,
  recipeText,
  replaceRecipeSource,
  updateRecipeSource,
  setRecipeOrigin,
  setReview,
} from './library'

const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
}

describe('Rezepte im Dokument library', () => {
  it('legt an, liest, ersetzt und löscht', () => {
    const doc = new Y.Doc()
    const id = createRecipe(doc, '---\ntitle: Brot\n---\n', 'p1', 10)
    expect(getRecipe(doc, id)).toEqual({
      id,
      source: '---\ntitle: Brot\n---\n',
      createdAt: 10,
      updatedAt: 10,
      createdBy: 'p1',
    })
    replaceRecipeSource(doc, id, 'neu', 20)
    expect(getRecipe(doc, id)).toMatchObject({ source: 'neu', updatedAt: 20 })
    setRecipeOrigin(doc, id, { kind: 'catalog', ref: 'backen/hefeteig', version: 'abc' })
    expect(getRecipe(doc, id)?.origin).toEqual({
      kind: 'catalog',
      ref: 'backen/hefeteig',
      version: 'abc',
    })
    deleteRecipe(doc, id)
    expect(listRecipes(doc)).toEqual([])
  })

  it('führt gleichzeitige Bearbeitung des Textes zusammen', () => {
    const a = new Y.Doc()
    const id = createRecipe(a, 'Mische @Mehl{500%g}.', 'p1')
    const b = new Y.Doc()
    sync(a, b)
    recipeText(a, id)!.insert(0, 'Zuerst: ')
    const tb = recipeText(b, id)!
    tb.insert(tb.length, ' Dann backen.')
    sync(a, b)
    expect(getRecipe(a, id)?.source).toBe('Zuerst: Mische @Mehl{500%g}. Dann backen.')
    expect(getRecipe(b, id)?.source).toBe(getRecipe(a, id)?.source)
  })

  it('ändert nur den geänderten Teil (gleichzeitige Bearbeitung bleibt erhalten)', () => {
    const a = new Y.Doc()
    const id = createRecipe(a, '---\ntitle: Alt\n---\nSchritt eins.', 'p')
    const b = new Y.Doc()
    sync(a, b)
    updateRecipeSource(a, id, '---\ntitle: Neu\n---\nSchritt eins.')
    const tb = recipeText(b, id)!
    tb.insert(tb.length, ' Schritt zwei.')
    sync(a, b)
    expect(getRecipe(a, id)?.source).toBe('---\ntitle: Neu\n---\nSchritt eins. Schritt zwei.')
  })

  it('begrenzt die Größe', () => {
    const doc = new Y.Doc()
    const id = createRecipe(doc, 'x'.repeat(60_000), 'p')
    expect(getRecipe(doc, id)?.source).toHaveLength(50_000)
  })
})

describe('Notizen und Bewertungen', () => {
  it('je Person, gleichzeitig ohne Verlust', () => {
    const a = new Y.Doc()
    const id = createRecipe(a, 'x', 'p')
    const b = new Y.Doc()
    sync(a, b)
    setReview(a, id, 'anna', { stars: 5, note: 'Mit mehr Zimt' }, 1)
    setReview(b, id, 'ben', { stars: 3 }, 2)
    sync(a, b)
    const list = getReviews(a, id).sort((x, y) => x.personId.localeCompare(y.personId))
    expect(list).toEqual([
      { personId: 'anna', stars: 5, note: 'Mit mehr Zimt', updatedAt: 1 },
      { personId: 'ben', stars: 3, updatedAt: 2 },
    ])
    expect(averageStars(list)).toBe(4)
  })

  it('begrenzt Sterne und entfernt leere Angaben', () => {
    const doc = new Y.Doc()
    setReview(doc, 'r', 'anna', { stars: 9 })
    expect(getReviews(doc, 'r')[0]?.stars).toBe(5)
    setReview(doc, 'r', 'anna', { stars: null, note: '  ' })
    expect(getReviews(doc, 'r')).toEqual([])
    expect(averageStars([])).toBeUndefined()
  })
})

describe('Koch-Protokoll', () => {
  it('merkt sich, wann gekocht wurde', () => {
    const doc = new Y.Doc()
    logCooked(doc, 'r1', 'anna', 100)
    logCooked(doc, 'r1', 'ben', 300)
    logCooked(doc, 'r2', 'anna', 200)
    expect(lastCooked(doc, 'r1')).toBe(300)
    expect(cookedLog(doc).map((e) => e.at)).toEqual([300, 200, 100])
    deleteRecipe(doc, 'r1')
    expect(cookedLog(doc).map((e) => e.recipeId)).toEqual(['r2'])
  })
})

describe('Sammlungen', () => {
  it('ordnen Rezepte zu und räumen beim Löschen auf', () => {
    const doc = new Y.Doc()
    const r1 = createRecipe(doc, 'a', 'p')
    const r2 = createRecipe(doc, 'b', 'p')
    const c = createCollection(doc, ' Sonntagsessen ')
    setInCollection(doc, c, r1, true)
    setInCollection(doc, c, r2, true)
    setInCollection(doc, c, r2, false)
    renameCollection(doc, c, 'Sonntag')
    expect(listCollections(doc)).toEqual([{ id: c, name: 'Sonntag', recipeIds: [r1] }])
    deleteRecipe(doc, r1)
    expect(listCollections(doc)[0]!.recipeIds).toEqual([])
    deleteCollection(doc, c)
    expect(listCollections(doc)).toEqual([])
  })
})
