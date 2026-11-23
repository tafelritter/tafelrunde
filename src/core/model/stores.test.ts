// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DEFAULT_ORDER } from '@tafelritter/rezeptformat/basis'
import {
  addItem,
  createList,
  getItems,
  getLists,
  groupItems,
  setItemCategory,
  setListStore,
} from './shopping'
import {
  createStore,
  deleteStore,
  getStore,
  getStores,
  moveCategory,
  normalizeOrder,
  renameStore,
  setStoreOrder,
} from './stores'

describe('Läden', () => {
  it('legen an, benennen um, löschen', () => {
    const doc = new Y.Doc()
    const id = createStore(doc, ' Edeka ', 1)
    createStore(doc, 'Drogerie', 2)
    renameStore(doc, id, 'Edeka Mitte')
    expect(getStores(doc).map((s) => s.name)).toEqual(['Edeka Mitte', 'Drogerie'])
    expect(getStore(doc, id)?.order).toEqual(DEFAULT_ORDER)
    deleteStore(doc, id)
    expect(getStores(doc).map((s) => s.name)).toEqual(['Drogerie'])
  })

  it('verschieben Kategorien und halten die Reihenfolge vollständig', () => {
    const order = moveCategory(DEFAULT_ORDER, 'getraenke', -100)
    expect(order[0]).toBe('getraenke')
    expect(moveCategory(order, 'getraenke', -1)).toEqual(order)
    expect(normalizeOrder(['getraenke', 'getraenke', 'quatsch'])).toHaveLength(DEFAULT_ORDER.length)
    expect(normalizeOrder(null)).toEqual(DEFAULT_ORDER)
  })

  it('bestimmen die Gruppenreihenfolge einer Liste', () => {
    const doc = new Y.Doc()
    const listId = createList(doc, 'Liste')
    const a = addItem(doc, listId, { name: 'Wasser' }, 'd')
    const b = addItem(doc, listId, { name: 'Äpfel' }, 'd')
    setItemCategory(doc, a, 'getraenke')
    setItemCategory(doc, b, 'obst-gemuese')
    const storeId = createStore(doc, 'Getränkemarkt zuerst')
    setStoreOrder(doc, storeId, moveCategory(DEFAULT_ORDER, 'getraenke', -100))
    setListStore(doc, listId, storeId)
    const list = getLists(doc)[0]!
    expect(list.storeId).toBe(storeId)
    const groups = groupItems(
      doc,
      getItems(doc, listId),
      undefined,
      getStore(doc, list.storeId)?.order,
    )
    expect(groups.map((g) => g.category)).toEqual(['getraenke', 'obst-gemuese'])
    setListStore(doc, listId, undefined)
    expect(getLists(doc)[0]!.storeId).toBeUndefined()
  })
})
