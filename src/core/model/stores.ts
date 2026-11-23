// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Läden mit eigener Reihenfolge der Kategorien (plan/03-phase-1-einkaufsliste.md, 1.10).
 * Liegen im Dokument `live` des Bereichs und gelten für alle Listen darin.
 */

import * as Y from 'yjs'
import { type CategoryId, DEFAULT_ORDER, isCategoryId } from '@tafelritter/rezeptformat/basis'
import { randomId } from '../crypto/ids'
import { LIVE_ROOT } from './space'

export interface Store {
  id: string
  name: string
  order: CategoryId[]
  createdAt: number
}

const stores = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(LIVE_ROOT.stores)

/**
 * Bringt eine gespeicherte Reihenfolge in Form: unbekannte und doppelte
 * Einträge fallen weg, fehlende Kategorien kommen in Standard-Reihenfolge ans Ende.
 */
export function normalizeOrder(value: unknown): CategoryId[] {
  const seen = new Set<CategoryId>()
  for (const c of Array.isArray(value) ? value : []) if (isCategoryId(c)) seen.add(c)
  for (const c of DEFAULT_ORDER) seen.add(c)
  return [...seen]
}

export function createStore(doc: Y.Doc, name: string, now = Date.now()): string {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  if (!trimmed) throw new Error('Name darf nicht leer sein')
  const id = randomId()
  const entry = new Y.Map<unknown>()
  doc.transact(() => {
    stores(doc).set(id, entry)
    entry.set('name', trimmed)
    entry.set('order', [...DEFAULT_ORDER])
    entry.set('createdAt', now)
  })
  return id
}

export function renameStore(doc: Y.Doc, storeId: string, name: string): void {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  if (trimmed) stores(doc).get(storeId)?.set('name', trimmed)
}

export function deleteStore(doc: Y.Doc, storeId: string): void {
  stores(doc).delete(storeId)
}

export function setStoreOrder(doc: Y.Doc, storeId: string, order: readonly CategoryId[]): void {
  stores(doc).get(storeId)?.set('order', normalizeOrder(order))
}

export function getStores(doc: Y.Doc): Store[] {
  const out: Store[] = []
  stores(doc).forEach((entry, id) => {
    if (!(entry instanceof Y.Map)) return
    const name = entry.get('name')
    const createdAt = entry.get('createdAt')
    out.push({
      id,
      name: typeof name === 'string' ? name : '',
      order: normalizeOrder(entry.get('order')),
      createdAt: typeof createdAt === 'number' ? createdAt : 0,
    })
  })
  return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

export function getStore(doc: Y.Doc, storeId: string | undefined): Store | undefined {
  return storeId ? getStores(doc).find((s) => s.id === storeId) : undefined
}

/** Verschiebt eine Kategorie um `delta` Plätze (−1 nach oben, +1 nach unten). */
export function moveCategory(
  order: readonly CategoryId[],
  category: CategoryId,
  delta: number,
): CategoryId[] {
  const next = [...order]
  const from = next.indexOf(category)
  const to = Math.min(Math.max(from + delta, 0), next.length - 1)
  if (from < 0 || from === to) return next
  next.splice(from, 1)
  next.splice(to, 0, category)
  return next
}
