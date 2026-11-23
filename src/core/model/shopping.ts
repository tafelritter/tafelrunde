// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Einkaufslisten im Dokument `live` (plan/03-phase-1-einkaufsliste.md, 1.10).
 *
 * Listen und Einträge sind jeweils eine eigene `Y.Map`. So überschreibt das
 * Abhaken auf einem Gerät nicht die gleichzeitig geänderte Menge auf einem
 * anderen.
 */

import * as Y from 'yjs'
import {
  type CategoryId,
  DEFAULT_ORDER,
  FALLBACK_CATEGORY,
  isCategoryId,
  normalizeName,
} from '@tafelritter/rezeptformat/basis'
import { randomId } from '../crypto/ids'
import {
  type Amount,
  amountParts,
  formatAmount as formatRecipeAmount,
  parseQuantity,
  readAmount,
  scaleAmount,
  sumAmounts,
} from '@tafelritter/rezeptformat/basis'
import { LIVE_ROOT } from './space'

export interface ShoppingList {
  id: string
  name: string
  createdAt: number
  /** Gewählter Laden für die Sortierung, falls gesetzt. */
  storeId?: string
}

export interface Item {
  id: string
  listId: string
  name: string
  quantity: string
  unit: string
  note: string
  /** Fest gewählte Kategorie; sonst wird sie aus Zuordnung und Katalog bestimmt. */
  category?: CategoryId
  checked: boolean
  checkedAt?: number
  createdAt: number
  createdBy: string
  /** Artikel im Katalog, falls bekannt (Zusammenführen über die ID). */
  catalogId?: string
  /** Herkunft aus Rezepten („für: Pizza, Zwiebelkuchen“), plan/05-phase-3-planung.md, 3.4. */
  sources?: ItemSource[]
  /** Menge von Hand geändert: wird beim Nachziehen (3.7) nicht neu berechnet. */
  edited?: boolean
}

/**
 * Ein Beitrag zu einem Eintrag. Je Beitrag ein eigener Schlüssel `src:<key>`
 * in der Map des Eintrags, damit gleichzeitige Übernahmen nichts überschreiben.
 */
export interface ItemSource {
  /** `p:<planeintrag>` aus dem Plan, `r:<zufall>` aus einer Rezeptansicht, `manual` für Handeingabe. */
  key: string
  /** Rezepttitel; leer für die Handeingabe. */
  label: string
  amounts: Amount[]
}

/** Quelle für Einträge, die zu einem Planeintrag gehören. */
export const planSourceKey = (planEntryId: string) => `p:${planEntryId}`

export type ItemInput = Pick<Item, 'name'> & Partial<Pick<Item, 'quantity' | 'unit' | 'note'>>

/** Liefert die Katalog-Kategorie zu einem normalisierten Namen. */
export type CatalogLookup = (normalizedName: string) => CategoryId | undefined

const lists = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(LIVE_ROOT.lists)
const items = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>(LIVE_ROOT.items)
const overrides = (doc: Y.Doc) => doc.getMap<unknown>(LIVE_ROOT.categoryOverrides)

const str = (m: Y.Map<unknown>, k: string, fallback = '') => {
  const v = m.get(k)
  return typeof v === 'string' ? v : fallback
}
const num = (m: Y.Map<unknown>, k: string) => {
  const v = m.get(k)
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function cleanName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  if (!trimmed) throw new Error('Name darf nicht leer sein')
  return trimmed
}

// --- Listen -----------------------------------------------------------------

export function createList(doc: Y.Doc, name: string, now = Date.now()): string {
  const id = randomId()
  const entry = new Y.Map<unknown>()
  doc.transact(() => {
    lists(doc).set(id, entry)
    entry.set('name', cleanName(name))
    entry.set('createdAt', now)
  })
  return id
}

export function renameList(doc: Y.Doc, listId: string, name: string): void {
  lists(doc).get(listId)?.set('name', cleanName(name))
}

export function deleteList(doc: Y.Doc, listId: string): void {
  doc.transact(() => {
    lists(doc).delete(listId)
    for (const [id, entry] of items(doc)) {
      if (str(entry, 'listId') === listId) items(doc).delete(id)
    }
  })
}

export function getLists(doc: Y.Doc): ShoppingList[] {
  const out: ShoppingList[] = []
  lists(doc).forEach((entry, id) => {
    if (entry instanceof Y.Map) {
      const list: ShoppingList = {
        id,
        name: str(entry, 'name'),
        createdAt: num(entry, 'createdAt') ?? 0,
      }
      const storeId = str(entry, 'storeId')
      if (storeId) list.storeId = storeId
      out.push(list)
    }
  })
  return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

/** Laden für eine Liste wählen (`undefined` = Standard-Reihenfolge). */
export function setListStore(doc: Y.Doc, listId: string, storeId: string | undefined): void {
  const entry = lists(doc).get(listId)
  if (!entry) return
  if (storeId) entry.set('storeId', storeId)
  else entry.delete('storeId')
}

// --- Einträge ---------------------------------------------------------------

function readItem(id: string, entry: Y.Map<unknown>): Item {
  const item: Item = {
    id,
    listId: str(entry, 'listId'),
    name: str(entry, 'name'),
    quantity: str(entry, 'quantity'),
    unit: str(entry, 'unit'),
    note: str(entry, 'note'),
    checked: entry.get('checked') === true,
    createdAt: num(entry, 'createdAt') ?? 0,
    createdBy: str(entry, 'createdBy'),
  }
  const category = entry.get('category')
  if (isCategoryId(category)) item.category = category
  const checkedAt = num(entry, 'checkedAt')
  if (item.checked && checkedAt !== undefined) item.checkedAt = checkedAt
  const catalogId = str(entry, 'catalogId')
  if (catalogId) item.catalogId = catalogId
  const sources = readSources(entry)
  if (sources.length) item.sources = sources
  if (entry.get('edited') === true) item.edited = true
  return item
}

const SOURCE_PREFIX = 'src:'
const SOURCE_KEY = /^(manual|[pr]:[\w-]{1,64})$/

function readSources(entry: Y.Map<unknown>): ItemSource[] {
  const out: ItemSource[] = []
  for (const [k, value] of entry) {
    if (!k.startsWith(SOURCE_PREFIX)) continue
    const key = k.slice(SOURCE_PREFIX.length)
    const v = value as { label?: unknown; amounts?: unknown } | null
    if (!SOURCE_KEY.test(key) || typeof v !== 'object' || v === null) continue
    const amounts = Array.isArray(v.amounts)
      ? v.amounts.slice(0, 10).flatMap((a) => readAmount(a) ?? [])
      : []
    out.push({ key, label: typeof v.label === 'string' ? v.label.slice(0, 120) : '', amounts })
  }
  // Handeingabe zuerst, dann nach Rezept (stabil auf allen Geräten).
  return out.sort((a, b) =>
    a.key === 'manual'
      ? -1
      : b.key === 'manual'
        ? 1
        : a.label.localeCompare(b.label, 'de') || a.key.localeCompare(b.key),
  )
}

function writeSource(entry: Y.Map<unknown>, source: ItemSource): void {
  if (!SOURCE_KEY.test(source.key)) throw new Error('ungültige Quelle')
  entry.set(`${SOURCE_PREFIX}${source.key}`, {
    label: source.label,
    amounts: source.amounts.map((a) => ({ ...a })),
  })
}

/** Schreibt alle Felder eines Eintrags (Wiederherstellen, Übertragen in einen anderen Bereich). */
function writeItem(entry: Y.Map<unknown>, item: Item, listId: string): void {
  for (const [key, value] of Object.entries(item)) {
    if (key === 'id' || key === 'sources' || value === undefined) continue
    entry.set(key, key === 'listId' ? listId : value)
  }
  for (const source of item.sources ?? []) writeSource(entry, source)
}

/** Menge und Einheit aus der Summe aller Beiträge. */
export function quantityFromSources(sources: readonly ItemSource[]): {
  quantity: string
  unit: string
} {
  const amounts = sumAmounts(sources.flatMap((s) => s.amounts))
  if (amounts.length === 0) return { quantity: '', unit: '' }
  if (amounts.length === 1) return amountParts(amounts[0]!)
  return { quantity: amounts.map(formatRecipeAmount).join(' + '), unit: '' }
}

/** Liest die Handeingabe eines Eintrags als Menge („800“ + „g“). */
function manualAmounts(quantity: string, unit: string): Amount[] {
  if (!quantity) return []
  const q = parseQuantity(quantity)
  if (q && !q.unit) return [{ kind: 'number', value: q.value, unit, scalable: true }]
  return [{ kind: 'text', text: quantity, unit }]
}

export function addItem(
  doc: Y.Doc,
  listId: string,
  input: ItemInput,
  by: string,
  now = Date.now(),
): string {
  if (!lists(doc).has(listId)) throw new Error('unbekannte Liste')
  const id = randomId()
  const entry = new Y.Map<unknown>()
  doc.transact(() => {
    items(doc).set(id, entry)
    entry.set('listId', listId)
    entry.set('name', cleanName(input.name))
    entry.set('quantity', input.quantity?.trim() ?? '')
    entry.set('unit', input.unit?.trim() ?? '')
    entry.set('note', input.note?.trim() ?? '')
    entry.set('checked', false)
    entry.set('createdAt', now)
    entry.set('createdBy', by)
  })
  return id
}

export function updateItem(
  doc: Y.Doc,
  itemId: string,
  patch: Partial<Pick<Item, 'name' | 'quantity' | 'unit' | 'note'>>,
): void {
  const entry = items(doc).get(itemId)
  if (!entry) return
  doc.transact(() => {
    if (patch.name !== undefined) entry.set('name', cleanName(patch.name))
    for (const key of ['quantity', 'unit', 'note'] as const) {
      const value = patch[key]?.trim()
      if (value !== undefined && value !== str(entry, key)) {
        entry.set(key, value)
        // Mengen aus Rezepten, die von Hand geändert wurden, nicht mehr neu berechnen.
        if (key !== 'note' && readSources(entry).length) entry.set('edited', true)
      }
    }
  })
}

export function setChecked(doc: Y.Doc, itemId: string, checked: boolean, now = Date.now()): void {
  const entry = items(doc).get(itemId)
  if (!entry || (entry.get('checked') === true) === checked) return
  doc.transact(() => {
    entry.set('checked', checked)
    if (checked) entry.set('checkedAt', now)
    else entry.delete('checkedAt')
  })
}

export function removeItem(doc: Y.Doc, itemId: string): void {
  items(doc).delete(itemId)
}

/** „Erledigte entfernen“: gibt die entfernten Einträge zurück, damit sich das rückgängig machen lässt. */
export function removeChecked(doc: Y.Doc, listId: string): Item[] {
  const removed: Item[] = []
  doc.transact(() => {
    for (const [id, entry] of items(doc)) {
      if (str(entry, 'listId') === listId && entry.get('checked') === true) {
        removed.push(readItem(id, entry))
        items(doc).delete(id)
      }
    }
  })
  return removed
}

/** Stellt entfernte Einträge wieder her (Rückgängig). */
export function restoreItems(doc: Y.Doc, removed: readonly Item[]): void {
  doc.transact(() => {
    for (const item of removed) {
      if (!lists(doc).has(item.listId) || items(doc).has(item.id)) continue
      const entry = new Y.Map<unknown>()
      items(doc).set(item.id, entry)
      writeItem(entry, item, item.listId)
    }
  })
}

export function getItems(doc: Y.Doc, listId: string): Item[] {
  const out: Item[] = []
  items(doc).forEach((entry, id) => {
    if (entry instanceof Y.Map && str(entry, 'listId') === listId) out.push(readItem(id, entry))
  })
  return out
}

// --- Kategorien -------------------------------------------------------------

/**
 * Ändert die Kategorie eines Eintrags. Der Haushalt merkt sich die Zuordnung
 * für den Namen, sodass künftige Einträge gleichen Namens dort landen.
 */
export function setItemCategory(doc: Y.Doc, itemId: string, category: CategoryId): void {
  const entry = items(doc).get(itemId)
  if (!entry) return
  doc.transact(() => {
    entry.set('category', category)
    overrides(doc).set(normalizeName(str(entry, 'name')), category)
  })
}

export function categoryFor(
  doc: Y.Doc,
  item: Pick<Item, 'name' | 'category'>,
  lookup: CatalogLookup = () => undefined,
): CategoryId {
  if (item.category) return item.category
  const key = normalizeName(item.name)
  const override = overrides(doc).get(key)
  if (isCategoryId(override)) return override
  return lookup(key) ?? FALLBACK_CATEGORY
}

export interface ItemGroup {
  category: CategoryId
  items: Item[]
}

/**
 * Gruppiert nach Kategorie in der gewünschten Reihenfolge. Innerhalb einer
 * Gruppe stehen offene Einträge alphabetisch vorne, erledigte in der
 * Reihenfolge des Abhakens am Ende.
 */
export function groupItems(
  doc: Y.Doc,
  list: readonly Item[],
  lookup?: CatalogLookup,
  order: readonly CategoryId[] = DEFAULT_ORDER,
): ItemGroup[] {
  const byCategory = new Map<CategoryId, Item[]>()
  for (const item of list) {
    const category = categoryFor(doc, item, lookup)
    const group = byCategory.get(category)
    if (group) group.push(item)
    else byCategory.set(category, [item])
  }
  const rank = (c: CategoryId) => {
    const i = order.indexOf(c)
    return i < 0 ? order.length + DEFAULT_ORDER.indexOf(c) : i
  }
  const collator = new Intl.Collator('de-DE', { sensitivity: 'base' })
  return [...byCategory.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([category, group]) => ({
      category,
      items: group.sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1
        if (a.checked) return (a.checkedAt ?? 0) - (b.checkedAt ?? 0)
        return collator.compare(a.name, b.name) || a.createdAt - b.createdAt
      }),
    }))
}

// --- Doppelte Einträge ------------------------------------------------------

/** Offener Eintrag mit gleichem Namen in derselben Liste, falls vorhanden. */
export function findDuplicate(doc: Y.Doc, listId: string, name: string): Item | undefined {
  const key = normalizeName(name)
  return getItems(doc, listId).find((i) => !i.checked && normalizeName(i.name) === key)
}

/** Leere Menge zählt als 1 („Äpfel“ + „Äpfel 3“ = 4). */
function parseAmount(text: string): number | undefined {
  if (text === '') return 1
  if (!/^\d+([.,]\d+)?$/.test(text)) return undefined
  return Number(text.replace(',', '.'))
}

function formatAmount(value: number): string {
  return String(Math.round(value * 1000) / 1000).replace('.', ',')
}

/**
 * Führt `sourceId` in `targetId` zusammen. Gleiche Einheit und Zahlen werden
 * addiert, sonst werden die Mengen nebeneinander behalten.
 */
export function mergeItems(doc: Y.Doc, targetId: string, sourceId: string): void {
  const target = items(doc).get(targetId)
  const source = items(doc).get(sourceId)
  if (!target || !source || targetId === sourceId) return
  const t = readItem(targetId, target)
  const s = readItem(sourceId, source)
  doc.transact(() => {
    const a = parseAmount(t.quantity)
    const b = parseAmount(s.quantity)
    if (t.unit === s.unit && a !== undefined && b !== undefined) {
      if (t.quantity || s.quantity) target.set('quantity', formatAmount(a + b))
    } else {
      const left = [t.quantity, t.unit].filter(Boolean).join(' ') || '1'
      const right = [s.quantity, s.unit].filter(Boolean).join(' ')
      target.set('quantity', `${left} + ${right}`)
      target.set('unit', '')
    }
    const note = [t.note, s.note].filter(Boolean).join(' · ')
    if (note !== t.note) target.set('note', note)
    // Herkunft behalten; die Menge ist jetzt eine Handeingabe.
    for (const src of s.sources ?? []) {
      if (!t.sources?.some((x) => x.key === src.key)) writeSource(target, src)
    }
    if (t.sources || s.sources) target.set('edited', true)
    items(doc).delete(sourceId)
  })
}

// --- Liste in einen anderen Bereich übertragen ------------------------------

export interface ListExport {
  id: string
  name: string
  items: Item[]
}

/**
 * Liste samt Einträgen für die Übertragung in einen anderen Bereich. Die
 * Kategorie wird fest übernommen, weil die gemerkten Zuordnungen des
 * Haushalts im neuen Bereich fehlen.
 */
export function exportList(doc: Y.Doc, listId: string, lookup?: CatalogLookup): ListExport {
  const list = getLists(doc).find((l) => l.id === listId)
  if (!list) throw new Error('unbekannte Liste')
  return {
    id: list.id,
    name: list.name,
    items: getItems(doc, listId).map((i) => ({ ...i, category: categoryFor(doc, i, lookup) })),
  }
}

export function importList(doc: Y.Doc, data: ListExport, now = Date.now()): void {
  doc.transact(() => {
    const entry = new Y.Map<unknown>()
    lists(doc).set(data.id, entry)
    entry.set('name', cleanName(data.name))
    entry.set('createdAt', now)
    for (const item of data.items) {
      const e = new Y.Map<unknown>()
      items(doc).set(item.id, e)
      writeItem(e, item, data.id)
    }
  })
}

// --- Übernahme aus Rezepten und Plan (3.3–3.7) ------------------------------

/** Eine Zeile aus der Vorschau, die auf die Liste kommt. */
export interface TransferLine {
  name: string
  catalogId?: string
  sources: ItemSource[]
  /** In der Vorschau geänderte Menge; ersetzt die berechnete. */
  quantity?: string
  unit?: string
}

/** Katalog-ID zu einem normalisierten Namen, um vorhandene Einträge zu erkennen. */
export type CatalogIdLookup = (normalizedName: string) => string | undefined

/** Offener Eintrag in der Liste, der zur Zeile passt (Katalog-ID oder gleicher Name). */
function findMatch(
  doc: Y.Doc,
  listId: string,
  line: Pick<TransferLine, 'name' | 'catalogId'>,
  lookupId: CatalogIdLookup,
): string | undefined {
  const key = normalizeName(line.name)
  for (const [id, entry] of items(doc)) {
    if (str(entry, 'listId') !== listId || entry.get('checked') === true) continue
    const name = normalizeName(str(entry, 'name'))
    const catalogId = str(entry, 'catalogId') || lookupId(name)
    if (name === key || (line.catalogId && catalogId === line.catalogId)) return id
  }
  return undefined
}

/**
 * Übernimmt Zeilen in eine Liste. Passende offene Einträge werden ergänzt:
 * Ihre bisherige Menge bleibt als Handeingabe erhalten, gleiche Quellen
 * (z. B. derselbe Planeintrag) werden ersetzt statt doppelt gezählt.
 */
export function addLinesToList(
  doc: Y.Doc,
  listId: string,
  lines: readonly TransferLine[],
  by: string,
  {
    now = Date.now(),
    lookupId = () => undefined,
  }: { now?: number; lookupId?: CatalogIdLookup } = {},
): { added: number; merged: number } {
  if (!lists(doc).has(listId)) throw new Error('unbekannte Liste')
  let added = 0
  let merged = 0
  doc.transact(() => {
    for (const line of lines) {
      const matchId = findMatch(doc, listId, line, lookupId)
      const entry = matchId ? items(doc).get(matchId)! : new Y.Map<unknown>()
      if (matchId) {
        merged++
        const before = readItem(matchId, entry)
        if (!before.sources) {
          const manual = manualAmounts(before.quantity, before.unit)
          writeSource(entry, { key: 'manual', label: '', amounts: manual })
        }
        if (line.catalogId && !before.catalogId) entry.set('catalogId', line.catalogId)
      } else {
        added++
        const id = randomId()
        items(doc).set(id, entry)
        entry.set('listId', listId)
        entry.set('name', cleanName(line.name))
        entry.set('note', '')
        entry.set('checked', false)
        entry.set('createdAt', now)
        entry.set('createdBy', by)
        if (line.catalogId) entry.set('catalogId', line.catalogId)
      }
      const wasEdited = entry.get('edited') === true
      const previous = joinQuantity(str(entry, 'quantity'), str(entry, 'unit'))
      for (const source of line.sources) writeSource(entry, source)
      const own = quantityFromSources(line.sources)
      // In der Vorschau angepasste Menge gilt als Handeingabe.
      const overridden =
        line.quantity !== undefined &&
        (line.quantity.trim() !== own.quantity || (line.unit ?? '').trim() !== own.unit)
      let next: { quantity: string; unit: string }
      if (!overridden && !wasEdited) next = quantityFromSources(readSources(entry))
      else {
        entry.set('edited', true)
        const add = overridden
          ? { quantity: line.quantity!.trim(), unit: (line.unit ?? '').trim() }
          : own
        // Von Hand geänderte Menge nicht überschreiben, nur ergänzen.
        next =
          matchId && previous
            ? { quantity: `${previous} + ${joinQuantity(add.quantity, add.unit)}`, unit: '' }
            : add
      }
      if (next.quantity !== str(entry, 'quantity')) entry.set('quantity', next.quantity)
      if (next.unit !== str(entry, 'unit')) entry.set('unit', next.unit)
    }
  })
  return { added, merged }
}

const joinQuantity = (quantity: string, unit: string) => [quantity, unit].filter(Boolean).join(' ')

function formatSources(sources: readonly ItemSource[]): string {
  const q = quantityFromSources(sources)
  return joinQuantity(q.quantity, q.unit)
}

/** Auswirkung einer Planänderung auf einen offenen Listeneintrag. */
export interface PlanItemChange {
  itemId: string
  listId: string
  name: string
  before: string
  /** Neue Menge; `undefined`, wenn der Eintrag entfällt. */
  after: string | undefined
  /** Menge von Hand geändert: bleibt stehen, nur die Herkunft wird angepasst. */
  edited: boolean
}

/** `factor`: neue/alte Portionen; `'remove'`: Planeintrag entfällt. */
export type PlanChange = number | 'remove'

function changedSources(sources: readonly ItemSource[], key: string, change: PlanChange) {
  if (change === 'remove') return sources.filter((s) => s.key !== key)
  return sources.map((s) =>
    s.key === key ? { ...s, amounts: s.amounts.map((a) => scaleAmount(a, change)) } : s,
  )
}

/**
 * Welche offenen Einträge sich ändern, wenn ein Planeintrag entfernt wird
 * oder seine Portionen ändert (3.7). Abgehakte Einträge bleiben unberührt.
 */
export function planChangeEffects(
  doc: Y.Doc,
  planEntryId: string,
  change: PlanChange,
): PlanItemChange[] {
  const key = planSourceKey(planEntryId)
  const out: PlanItemChange[] = []
  for (const [id, entry] of items(doc)) {
    if (entry.get('checked') === true || !entry.has(`${SOURCE_PREFIX}${key}`)) continue
    const item = readItem(id, entry)
    const sources = item.sources ?? []
    const next = changedSources(sources, key, change)
    const before = [item.quantity, item.unit].filter(Boolean).join(' ')
    const remaining = next.filter((s) => s.key !== 'manual' || s.amounts.length)
    let after: string | undefined
    if (item.edited) after = before
    else if (remaining.length === 0) after = undefined
    else after = formatSources(next)
    if (after !== before || change === 'remove' || item.edited)
      out.push({
        itemId: id,
        listId: item.listId,
        name: item.name,
        before,
        after,
        edited: !!item.edited,
      })
  }
  const collator = new Intl.Collator('de-DE', { sensitivity: 'base' })
  return out.sort((a, b) => collator.compare(a.name, b.name))
}

/** Zieht die Planänderung in den offenen Einträgen nach (nach Rückfrage). */
export function applyPlanChange(doc: Y.Doc, planEntryId: string, change: PlanChange): void {
  const key = planSourceKey(planEntryId)
  doc.transact(() => {
    for (const effect of planChangeEffects(doc, planEntryId, change)) {
      const entry = items(doc).get(effect.itemId)
      if (!entry) continue
      if (effect.after === undefined) {
        items(doc).delete(effect.itemId)
        continue
      }
      const sources = changedSources(readSources(entry), key, change)
      if (change === 'remove') entry.delete(`${SOURCE_PREFIX}${key}`)
      else
        writeSource(
          entry,
          sources.find((s) => s.key === key)!,
        )
      if (effect.edited) continue
      const q = quantityFromSources(sources)
      if (q.quantity !== str(entry, 'quantity')) entry.set('quantity', q.quantity)
      if (q.unit !== str(entry, 'unit')) entry.set('unit', q.unit)
    }
  })
}
