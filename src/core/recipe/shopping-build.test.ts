// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { buildCatalogIndex } from '@tafelritter/rezeptformat/basis'
import { normalizeName } from '@tafelritter/rezeptformat/basis'
import { addPantryItem, isPantryItem } from '../model/plan'
import {
  addItem,
  addLinesToList,
  applyPlanChange,
  categoryFor,
  createList,
  getItems,
  planChangeEffects,
  planSourceKey,
  setChecked,
  updateItem,
} from '../model/shopping'
import { formatAmount } from '@tafelritter/rezeptformat/basis'
import { parseRecipe } from '@tafelritter/rezeptformat'
import type { RecipeEntry, RecipeIndex } from '@tafelritter/rezeptformat'
import {
  type ShoppingRequest,
  type SubRecipeMode,
  buildShoppingLines,
  findSubRecipes,
} from './shopping-build'

const catalog = buildCatalogIndex({
  items: [
    { id: 'zwiebeln', name: 'Zwiebeln', category: 'obst-gemuese', synonyms: ['Zwiebel'] },
    { id: 'mehl', name: 'Mehl', category: 'backen', synonyms: ['Weizenmehl'] },
    { id: 'milch', name: 'Milch', category: 'milch-kaese-eier' },
    { id: 'butter', name: 'Butter', category: 'milch-kaese-eier' },
    { id: 'salz', name: 'Salz', category: 'gewuerze-oele-saucen' },
    { id: 'tomaten', name: 'Tomaten', category: 'obst-gemuese', synonyms: ['Tomate'] },
    { id: 'eier', name: 'Eier', category: 'milch-kaese-eier', synonyms: ['Ei'] },
  ],
})

const HEFETEIG = `---
title: Hefeteig
yield: 800 g
---
Verknete @Mehl{500%g}, @Milch{250%ml}, @Butter{50%g} und @Salz{1%Prise}.`

const PIZZA = `---
title: Pizza
servings: 4
---
Belege @./Hefeteig{400%g} mit @Tomaten{4} und @Zwiebel{1}.`

const ZWIEBELKUCHEN = `---
title: Zwiebelkuchen
servings: 4
---
@./Hefeteig{800%g} mit @Zwiebeln{1%kg}, @Eier{3%Stück} und @Salz{1%TL} backen.`

const PFANNKUCHEN = `---
title: Pfannkuchen
servings: 2
---
@Weizenmehl{0,2%kg}, @Milch{0,4%l}, @Ei{2} und @Salz{1%Prise} verrühren.`

const SUPPE = `---
title: Tomatensuppe
servings: 4
---
@Tomaten{800%g} und @Zwiebel{2} kochen, mit @?Sahne{100%ml} verfeinern.`

const SALAT = `---
title: Salat
servings: 2
---
@Tomate{2} und @Zwiebel{1/2} schneiden, mit @Öl{2%EL} und @Essig{1%EL}.`

const entries: RecipeEntry[] = [
  ['h', HEFETEIG],
  ['pizza', PIZZA],
  ['zk', ZWIEBELKUCHEN],
  ['pk', PFANNKUCHEN],
  ['suppe', SUPPE],
  ['salat', SALAT],
].map(([id, src]) => ({ key: `space:a/${id}`, scope: 'a', recipe: parseRecipe(src!) }))
const index: RecipeIndex = { entries }
const byId = (id: string) => entries.find((e) => e.key === `space:a/${id}`)!

const request = (id: string, sourceKey: string, factor = 1): ShoppingRequest => ({
  sourceKey,
  label: byId(id).recipe.meta.title,
  recipe: byId(id).recipe,
  scope: 'a',
  factor,
})

const options = (doc: Y.Doc, modes = new Map<string, SubRecipeMode>()) => ({
  modes,
  catalog: (name: string) => catalog.item(name),
  isPantry: (name: string, id?: string) => isPantryItem(doc, name, id),
})

const week = [
  request('pizza', 'p:e1', 2), // 8 Portionen
  request('zk', 'p:e2'),
  request('pk', 'p:e3', 2), // 4 Portionen
  request('suppe', 'p:e4'),
  request('salat', 'p:e5'),
]

const show = (lines: ReturnType<typeof buildShoppingLines>) =>
  Object.fromEntries(lines.map((l) => [l.name, l.amounts.map(formatAmount).join(' + ')]))

describe('Einkaufsliste aus einer Woche', () => {
  it('führt fünf Rezepte über Katalog-IDs und Einheiten zusammen', () => {
    const doc = new Y.Doc()
    const lines = buildShoppingLines(index, week, options(doc))
    expect(show(lines)).toEqual({
      // Hefeteig: 800 g (Pizza ×2) + 800 g = 1600 g Teig = 2 × 800 g
      Butter: '100 g',
      Eier: '7', // 3 Stück + 2 × 2
      Essig: '1 EL',
      Mehl: '1,4 kg', // 1000 g aus Teig + 0,4 kg
      Milch: '1,3 l', // 500 ml + 0,8 l
      Öl: '2 EL',
      Sahne: '100 ml',
      Salz: '4 Prise + 1 TL', // 2 × 1 aus dem Teig, 2 × 1 aus den Pfannkuchen
      Tomaten: '10 + 800 g', // 8 + 2 Stück, 800 g
      Zwiebeln: '4,5 + 1 kg', // 2 + 2 + 0,5 Stück, 1 kg
    })
  })

  it('zeigt die Herkunft je Eintrag', () => {
    const doc = new Y.Doc()
    const lines = buildShoppingLines(index, week, options(doc))
    const zwiebeln = lines.find((l) => l.name === 'Zwiebeln')!
    expect(zwiebeln.catalogId).toBe('zwiebeln')
    expect(zwiebeln.sources.map((s) => s.label)).toEqual([
      'Pizza',
      'Zwiebelkuchen',
      'Tomatensuppe',
      'Salat',
    ])
    expect(lines.find((l) => l.name === 'Sahne')!.optional).toBe(true)
  })

  it('markiert Grundvorräte', () => {
    const doc = new Y.Doc()
    addPantryItem(doc, 'Salz', 'salz')
    addPantryItem(doc, 'Öl')
    const lines = buildShoppingLines(index, week, options(doc))
    expect(lines.filter((l) => l.pantry).map((l) => l.name)).toEqual(['Öl', 'Salz'])
  })
})

describe('Unterrezepte', () => {
  it('findet sie mit den verwendenden Rezepten', () => {
    expect(findSubRecipes(index, week)).toEqual([
      { key: 'space:a/h', title: 'Hefeteig', usedBy: ['Pizza', 'Zwiebelkuchen'] },
    ])
  })

  it('lässt sie weg oder übernimmt sie als einen Posten', () => {
    const doc = new Y.Doc()
    const omit = buildShoppingLines(
      index,
      [request('pizza', 'p:e1')],
      options(doc, new Map([['space:a/h', 'omit']])),
    )
    expect(Object.keys(show(omit))).toEqual(['Tomaten', 'Zwiebeln'])
    const item = buildShoppingLines(
      index,
      [request('pizza', 'p:e1', 2), request('zk', 'p:e2')],
      options(doc, new Map([['space:a/h', 'item']])),
    )
    const teig = item.find((l) => l.name === 'Hefeteig')!
    expect(teig.recipe).toBe(true)
    expect(teig.amounts.map(formatAmount)).toEqual(['1,6 kg'])
    expect(item.some((l) => l.name === 'Mehl')).toBe(false)
  })
})

describe('Übernehmen in die Liste', () => {
  const setup = () => {
    const doc = new Y.Doc()
    const listId = createList(doc, 'Woche', 1)
    return { doc, listId }
  }
  const lookupId = (name: string) => catalog.item(name)?.id

  it('legt Einträge mit Katalog-Kategorie und Herkunft an', () => {
    const { doc, listId } = setup()
    const lines = buildShoppingLines(index, week, options(doc))
    expect(addLinesToList(doc, listId, lines, 'd1', { now: 5 })).toEqual({
      added: lines.length,
      merged: 0,
    })
    const zwiebeln = getItems(doc, listId).find((i) => i.name === 'Zwiebeln')!
    expect(zwiebeln).toMatchObject({ quantity: '4,5 + 1 kg', unit: '', catalogId: 'zwiebeln' })
    expect(categoryFor(doc, zwiebeln, (n) => catalog.lookup(n))).toBe('obst-gemuese')
    expect(zwiebeln.sources?.map((s) => s.label)).toHaveLength(4)
    const mehl = getItems(doc, listId).find((i) => i.name === 'Mehl')!
    expect([mehl.quantity, mehl.unit]).toEqual(['1,4', 'kg'])
  })

  it('ergänzt vorhandene Einträge und behält die Handeingabe', () => {
    const { doc, listId } = setup()
    addItem(doc, listId, { name: 'Zwiebel', quantity: '2' }, 'd1')
    addItem(doc, listId, { name: 'Milch', quantity: '1', unit: 'l' }, 'd1')
    const lines = buildShoppingLines(index, [request('pk', 'p:e3')], options(doc))
    const result = addLinesToList(doc, listId, lines, 'd1', { lookupId })
    expect(result.merged).toBe(1)
    const milch = getItems(doc, listId).find((i) => i.name === 'Milch')!
    expect([milch.quantity, milch.unit]).toEqual(['1,4', 'l'])
    expect(milch.sources?.map((s) => s.key)).toEqual(['manual', 'p:e3'])
  })

  it('zählt denselben Planeintrag nicht doppelt', () => {
    const { doc, listId } = setup()
    const lines = buildShoppingLines(index, [request('suppe', 'p:e4')], options(doc))
    addLinesToList(doc, listId, lines, 'd1', { lookupId })
    addLinesToList(doc, listId, lines, 'd1', { lookupId })
    const tomaten = getItems(doc, listId).find((i) => i.name === 'Tomaten')!
    expect([tomaten.quantity, tomaten.unit]).toEqual(['800', 'g'])
  })

  it('übernimmt in der Vorschau geänderte Mengen', () => {
    const { doc, listId } = setup()
    const [line] = buildShoppingLines(index, [request('salat', 'p:e5')], options(doc)).filter(
      (l) => l.name === 'Tomaten',
    )
    addLinesToList(doc, listId, [{ ...line!, quantity: '3', unit: '' }], 'd1')
    expect(getItems(doc, listId)[0]).toMatchObject({ quantity: '3', edited: true })
  })
})

describe('Änderungen nachziehen', () => {
  const setup = () => {
    const doc = new Y.Doc()
    const listId = createList(doc, 'Woche', 1)
    const lines = buildShoppingLines(
      index,
      [request('suppe', planSourceKey('e4')), request('salat', planSourceKey('e5'))],
      options(doc),
    )
    addLinesToList(doc, listId, lines, 'd1')
    const get = (name: string) => getItems(doc, listId).find((i) => i.name === name)
    return { doc, listId, get }
  }

  it('entfernt Einträge, die nur zum Planeintrag gehören', () => {
    const { doc, get } = setup()
    const effects = planChangeEffects(doc, 'e5', 'remove')
    expect(effects.map((e) => [e.name, e.before, e.after])).toEqual([
      ['Essig', '1 EL', undefined],
      ['Öl', '2 EL', undefined],
      ['Tomaten', '2 + 800 g', '800 g'],
      ['Zwiebeln', '2,5', '2'],
    ])
    applyPlanChange(doc, 'e5', 'remove')
    expect(get('Essig')).toBeUndefined()
    expect(get('Zwiebeln')).toMatchObject({ quantity: '2', unit: '' })
    expect(get('Tomaten')?.sources?.map((s) => s.label)).toEqual(['Tomatensuppe'])
  })

  it('skaliert bei geänderten Portionen', () => {
    const { doc, get } = setup()
    applyPlanChange(doc, 'e4', 0.5)
    expect(get('Tomaten')).toMatchObject({ quantity: '2 + 400 g' })
    expect(get('Zwiebeln')).toMatchObject({ quantity: '1,5' })
  })

  it('lässt abgehakte und von Hand geänderte Einträge stehen', () => {
    const { doc, get } = setup()
    setChecked(doc, get('Essig')!.id, true)
    updateItem(doc, get('Zwiebeln')!.id, { quantity: '5' })
    const effects = planChangeEffects(doc, 'e5', 'remove')
    expect(effects.find((e) => e.name === 'Essig')).toBeUndefined()
    expect(effects.find((e) => e.name === 'Zwiebeln')).toMatchObject({ after: '5', edited: true })
    applyPlanChange(doc, 'e5', 'remove')
    expect(get('Essig')).toBeDefined()
    expect(get('Zwiebeln')).toMatchObject({ quantity: '5' })
    expect(get('Zwiebeln')?.sources?.map((s) => s.key)).toEqual(['p:e4'])
  })

  it('behält Handeingaben beim Entfernen', () => {
    const doc = new Y.Doc()
    const listId = createList(doc, 'Woche', 1)
    addItem(doc, listId, { name: 'Essig', quantity: '1', unit: 'Flasche' }, 'd1')
    const lines = buildShoppingLines(index, [request('salat', 'p:e5')], options(doc))
    addLinesToList(doc, listId, lines, 'd1')
    const essig = () => getItems(doc, listId).find((i) => normalizeName(i.name) === 'essig')
    expect(essig()?.quantity).toBe('1 Flasche + 1 EL')
    applyPlanChange(doc, 'e5', 'remove')
    expect(essig()).toMatchObject({ quantity: '1', unit: 'Flasche' })
  })
})
