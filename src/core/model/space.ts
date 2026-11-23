// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Bereich und Mitglieder-Register im Dokument `live`
 * (siehe plan/01-architektur.md, „Datenmodell“).
 *
 * Mitglieder sind Geräte. Gleichzeitige Änderungen an verschiedenen Feldern
 * (z. B. Gerätename und Datei-IDs) werden zusammengeführt, siehe `membersMap`.
 */

import type * as Y from 'yjs'
import { type DocKind, DOC_KINDS } from '../crypto/envelope'
import { isValidId } from '../crypto/ids'

/** `recipe-share`: Rezept-Freigabe, nur der Ersteller schreibt (2.12). */
export type SpaceKind = 'personal' | 'household' | 'shared-list' | 'recipe-share'

export const SPACE_KINDS: readonly SpaceKind[] = [
  'personal',
  'household',
  'shared-list',
  'recipe-share',
]

export interface FileRefs {
  live?: string
  library?: string
}

export interface Member {
  deviceId: string
  /** Personen-ID (gleich auf allen Geräten einer Person), für Notizen und Bewertungen. */
  personId?: string
  person: string
  deviceName: string
  provider: string
  files: FileRefs
  joinedAt: number
  removedAt?: number
}

export const LIVE_ROOT = {
  meta: 'meta',
  members: 'members',
  lists: 'lists',
  items: 'items',
  categoryOverrides: 'categoryOverrides',
  stores: 'stores',
  plan: 'plan',
  planSettings: 'planSettings',
  pantry: 'pantry',
} as const

/**
 * Das Register ist flach: ein Schlüssel `<deviceId>/<feld>` je Feld.
 *
 * Verschachtelte `Y.Map`s je Gerät wären hier falsch: Einladendes und neues
 * Gerät legen den Eintrag für das neue Gerät gleichzeitig an. Yjs behält bei
 * gleichzeitigem Setzen desselben Schlüssels nur einen Wert – die andere Map
 * samt späterer Änderungen (z. B. der Datei-ID) ginge verloren. Flache Felder
 * werden dagegen einzeln zusammengeführt. Geräte-IDs enthalten kein `/`.
 */
export function membersMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap(LIVE_ROOT.members)
}

type MemberField =
  'personId' | 'person' | 'deviceName' | 'provider' | 'joinedAt' | 'removedAt' | `file:${DocKind}`

function entry(doc: Y.Doc, deviceId: string) {
  const map = membersMap(doc)
  const k = (field: MemberField) => `${deviceId}/${field}`
  return {
    get: (field: MemberField) => map.get(k(field)),
    has: (field: MemberField) => map.has(k(field)),
    set: (field: MemberField, value: string | number) => {
      if (map.get(k(field)) !== value) map.set(k(field), value)
    },
  }
}

function deviceIds(doc: Y.Doc): Set<string> {
  const ids = new Set<string>()
  for (const key of membersMap(doc).keys()) {
    const slash = key.indexOf('/')
    if (slash > 0) ids.add(key.slice(0, slash))
  }
  return ids
}

export function initSpace(doc: Y.Doc, name: string, kind: SpaceKind): void {
  const meta = doc.getMap<unknown>(LIVE_ROOT.meta)
  doc.transact(() => {
    if (!meta.has('name')) meta.set('name', name)
    if (!meta.has('kind')) meta.set('kind', kind)
  })
}

export function spaceName(doc: Y.Doc): string {
  const name = doc.getMap<unknown>(LIVE_ROOT.meta).get('name')
  return typeof name === 'string' ? name : ''
}

export function spaceKind(doc: Y.Doc): SpaceKind | undefined {
  const kind = doc.getMap<unknown>(LIVE_ROOT.meta).get('kind')
  return SPACE_KINDS.includes(kind as SpaceKind) ? (kind as SpaceKind) : undefined
}

/** Personen-ID der Eigentümerin eines persönlichen Bereichs. */
export function setSpaceOwner(doc: Y.Doc, personId: string): void {
  if (isValidId(personId)) doc.getMap<unknown>(LIVE_ROOT.meta).set('owner', personId)
}

export function spaceOwner(doc: Y.Doc): string | undefined {
  const owner = doc.getMap<unknown>(LIVE_ROOT.meta).get('owner')
  return isValidId(owner) ? owner : undefined
}

export function renameSpace(doc: Y.Doc, name: string): void {
  doc.getMap<unknown>(LIVE_ROOT.meta).set('name', name.trim())
}

export function upsertMember(
  doc: Y.Doc,
  member: Omit<Member, 'files'> & { files?: FileRefs },
): void {
  if (!isValidId(member.deviceId)) throw new Error('ungültige Geräte-ID')
  const e = entry(doc, member.deviceId)
  doc.transact(() => {
    e.set('person', member.person)
    if (member.personId && isValidId(member.personId)) e.set('personId', member.personId)
    e.set('deviceName', member.deviceName)
    e.set('provider', member.provider)
    if (!e.has('joinedAt')) e.set('joinedAt', member.joinedAt)
    for (const kind of DOC_KINDS) {
      const fileId = member.files?.[kind]
      if (fileId) e.set(`file:${kind}`, fileId)
    }
  })
}

export function setMemberFile(doc: Y.Doc, deviceId: string, kind: DocKind, fileId: string): void {
  if (!isValidId(fileId)) throw new Error('ungültige Datei-ID')
  const e = entry(doc, deviceId)
  if (!e.has('joinedAt')) throw new Error('unbekanntes Gerät')
  e.set(`file:${kind}`, fileId)
}

export function renameDevice(doc: Y.Doc, deviceId: string, deviceName: string): void {
  const e = entry(doc, deviceId)
  if (e.has('joinedAt')) e.set('deviceName', deviceName.trim())
}

/** Ein entferntes Gerät bleibt als Grabstein im Register, damit es nicht wieder auftaucht. */
export function markRemoved(doc: Y.Doc, deviceId: string, at: number): void {
  const e = entry(doc, deviceId)
  if (e.has('joinedAt')) e.set('removedAt', at)
}

function readMember(doc: Y.Doc, deviceId: string): Member | undefined {
  if (!isValidId(deviceId)) return undefined
  const e = entry(doc, deviceId)
  const str = (f: MemberField) => {
    const v = e.get(f)
    return typeof v === 'string' ? v : undefined
  }
  const num = (f: MemberField) => {
    const v = e.get(f)
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }
  const joinedAt = num('joinedAt')
  // Ohne Beitrittszeitpunkt gibt es das Gerät nicht (z. B. nur eine verwaiste Datei-ID).
  if (joinedAt === undefined) return undefined
  const files: FileRefs = {}
  for (const kind of DOC_KINDS) {
    const fileId = str(`file:${kind}`)
    if (fileId && isValidId(fileId)) files[kind] = fileId
  }
  const member: Member = {
    deviceId,
    person: str('person') ?? '',
    deviceName: str('deviceName') ?? '',
    provider: str('provider') ?? '',
    files,
    joinedAt,
  }
  const removedAt = num('removedAt')
  if (removedAt !== undefined) member.removedAt = removedAt
  const personId = str('personId')
  if (personId && isValidId(personId)) member.personId = personId
  return member
}

export function listMembers(doc: Y.Doc, { includeRemoved = false } = {}): Member[] {
  const out: Member[] = []
  for (const id of deviceIds(doc)) {
    const m = readMember(doc, id)
    if (m && (includeRemoved || m.removedAt === undefined)) out.push(m)
  }
  return out.sort((a, b) => a.joinedAt - b.joinedAt || a.deviceId.localeCompare(b.deviceId))
}

/** Anzeigename je Personen-ID, z. B. für Bewertungen. */
export function personNames(doc: Y.Doc): Map<string, string> {
  const names = new Map<string, string>()
  for (const m of listMembers(doc, { includeRemoved: true })) {
    if (m.personId && m.person) names.set(m.personId, m.person)
  }
  return names
}

/** Dateien der anderen, nicht entfernten Geräte für ein Dokument – Eingabe für den Sync. */
export function peerFiles(
  doc: Y.Doc,
  kind: DocKind,
  selfId: string,
): { deviceId: string; fileId: string }[] {
  return listMembers(doc).flatMap((m) => {
    const fileId = m.files[kind]
    return m.deviceId !== selfId && fileId ? [{ deviceId: m.deviceId, fileId }] : []
  })
}

export function getMember(doc: Y.Doc, deviceId: string): Member | undefined {
  return readMember(doc, deviceId)
}
