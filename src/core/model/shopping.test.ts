// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { normalizeName } from '@tafelritter/rezeptformat/basis'
import {
  addItem,
  categoryFor,
  createList,
  deleteList,
  findDuplicate,
  getItems,
  getLists,
  groupItems,
  mergeItems,
  removeChecked,
  renameList,
  restoreItems,
  setChecked,
  setItemCategory,
  updateItem,
} from './shopping'

function setup() {
  const doc = new Y.Doc()
  const listId = createList(doc, 'Wocheneinkauf', 1)
  return { doc, listId }
}

const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
}

describe('Listen', () => {
  it('legt an, benennt um und löscht samt Einträgen', () => {
    const { doc, listId } = setup()
    const other = createList(doc, '  Grillfest  ', 2)
    addItem(doc, listId, { name: 'Milch' }, 'd')
    addItem(doc, other, { name: 'Kohle' }, 'd')
    renameList(doc, listId, 'Woche')
    expect(getLists(doc).map((l) => l.name)).toEqual(['Woche', 'Grillfest'])
    deleteList(doc, listId)
    expect(getLists(doc).map((l) => l.id)).toEqual([other])
    expect(getItems(doc, listId)).toEqual([])
    expect(getItems(doc, other)).toHaveLength(1)
  })

  it('lehnt leere Namen ab', () => {
    const doc = new Y.Doc()
    expect(() => createList(doc, '   ')).toThrow()
  })
})

describe('Einträge', () => {
  it('speichert Menge, Einheit und Notiz getrimmt', () => {
    const { doc, listId } = setup()
    const id = addItem(
      doc,
      listId,
      { name: ' Milch ', quantity: ' 2 ', unit: 'l', note: 'Bio' },
      'dev',
      5,
    )
    expect(getItems(doc, listId)).toEqual([
      {
        id,
        listId,
        name: 'Milch',
        quantity: '2',
        unit: 'l',
        note: 'Bio',
        checked: false,
        createdAt: 5,
        createdBy: 'dev',
      },
    ])
  })

  it('verweigert Einträge in unbekannte Listen', () => {
    const doc = new Y.Doc()
    expect(() => addItem(doc, 'nope', { name: 'x' }, 'd')).toThrow()
  })

  it('hakt ab und wieder auf', () => {
    const { doc, listId } = setup()
    const id = addItem(doc, listId, { name: 'Brot' }, 'd')
    setChecked(doc, id, true, 100)
    expect(getItems(doc, listId)[0]).toMatchObject({ checked: true, checkedAt: 100 })
    setChecked(doc, id, false)
    expect(getItems(doc, listId)[0]).not.toHaveProperty('checkedAt')
  })

  it('entfernt Erledigte und stellt sie wieder her', () => {
    const { doc, listId } = setup()
    const a = addItem(doc, listId, { name: 'A' }, 'd')
    addItem(doc, listId, { name: 'B' }, 'd')
    setChecked(doc, a, true, 7)
    const removed = removeChecked(doc, listId)
    expect(getItems(doc, listId).map((i) => i.name)).toEqual(['B'])
    restoreItems(doc, removed)
    expect(getItems(doc, listId).find((i) => i.id === a)).toMatchObject({
      name: 'A',
      checked: true,
      checkedAt: 7,
    })
  })

  it('führt gleichzeitige Änderungen verschiedener Felder zusammen', () => {
    const { doc: a, listId } = setup()
    const id = addItem(a, listId, { name: 'Milch' }, 'd')
    const b = new Y.Doc()
    sync(a, b)
    setChecked(a, id, true)
    updateItem(b, id, { quantity: '3', note: 'laktosefrei' })
    sync(a, b)
    for (const doc of [a, b]) {
      expect(getItems(doc, listId)[0]).toMatchObject({
        checked: true,
        quantity: '3',
        note: 'laktosefrei',
      })
    }
  })
})

describe('Kategorien', () => {
  const lookup = (name: string) => (name === 'äpfel' ? ('obst-gemuese' as const) : undefined)

  it('nimmt Katalog, sonst „Sonstiges“', () => {
    const doc = new Y.Doc()
    expect(categoryFor(doc, { name: ' Äpfel ' }, lookup)).toBe('obst-gemuese')
    expect(categoryFor(doc, { name: 'Unbekannt' }, lookup)).toBe('sonstiges')
  })

  it('merkt sich geänderte Zuordnungen für den Haushalt', () => {
    const { doc, listId } = setup()
    const id = addItem(doc, listId, { name: 'Hafermilch' }, 'd')
    setItemCategory(doc, id, 'milch-kaese-eier')
    const next = addItem(doc, listId, { name: 'hafermilch' }, 'd')
    const item = getItems(doc, listId).find((i) => i.id === next)!
    expect(categoryFor(doc, item, lookup)).toBe('milch-kaese-eier')
  })

  it('gruppiert in Ladenreihenfolge, Erledigte ans Ende der Gruppe', () => {
    const { doc, listId } = setup()
    const banane = addItem(doc, listId, { name: 'Bananen' }, 'd')
    addItem(doc, listId, { name: 'Äpfel' }, 'd')
    addItem(doc, listId, { name: 'Zahnpasta' }, 'd')
    const birne = addItem(doc, listId, { name: 'Birnen' }, 'd')
    for (const id of [banane, birne]) setItemCategory(doc, id, 'obst-gemuese')
    setChecked(doc, banane, true, 2)
    const groups = groupItems(doc, getItems(doc, listId), lookup, ['sonstiges', 'obst-gemuese'])
    expect(groups.map((g) => [g.category, g.items.map((i) => i.name)])).toEqual([
      ['sonstiges', ['Zahnpasta']],
      ['obst-gemuese', ['Äpfel', 'Birnen', 'Bananen']],
    ])
  })

  it('normalisiert Namen', () => {
    expect(normalizeName('  Rote   Bete ')).toBe('rote bete')
    expect(normalizeName('Äpfel')).toBe('äpfel')
  })
})

describe('Doppelte Einträge', () => {
  it('erkennt offene Einträge gleichen Namens', () => {
    const { doc, listId } = setup()
    const id = addItem(doc, listId, { name: 'Milch' }, 'd')
    expect(findDuplicate(doc, listId, ' milch')?.id).toBe(id)
    setChecked(doc, id, true)
    expect(findDuplicate(doc, listId, 'Milch')).toBeUndefined()
  })

  it.each([
    [['2', 'l'], ['1,5', 'l'], '3,5', 'l'],
    [['', ''], ['3', ''], '4', ''],
    [['', ''], ['', ''], '', ''],
    [['2', 'l'], ['500', 'ml'], '2 l + 500 ml', ''],
    [['', ''], ['1', 'Packung'], '1 + 1 Packung', ''],
  ])('führt %j und %j zu %s %s zusammen', ([q1, u1], [q2, u2], quantity, unit) => {
    const { doc, listId } = setup()
    const a = addItem(doc, listId, { name: 'X', quantity: q1!, unit: u1!, note: 'n1' }, 'd')
    const b = addItem(doc, listId, { name: 'x', quantity: q2!, unit: u2!, note: 'n2' }, 'd')
    mergeItems(doc, a, b)
    const items = getItems(doc, listId)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: a, quantity, unit, note: 'n1 · n2' })
  })
})
