// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Verknüpfte Bereiche (plan/03-phase-1-einkaufsliste.md, 1.11): Eine Liste,
 * die mit Externen geteilt wird, wandert in einen eigenen Bereich. Dessen
 * Schlüssel steht im Dokument des Haushalts – verschlüsselt mit dem
 * Haushaltsschlüssel –, sodass alle Haushaltsgeräte ohne eigene Einladung
 * beitreten. Ihre Datei-IDs melden sie ebenfalls dort; ein Antwort-Code ist
 * innerhalb des Haushalts nicht nötig, weil die Mitglieder einander vertrauen.
 *
 * Flache Schlüssel `<spaceId>/<feld>` aus demselben Grund wie im Register:
 * Gleichzeitige Einträge mehrerer Geräte dürfen sich nicht überschreiben.
 */

import type * as Y from 'yjs'
import { fromBase64url } from '../crypto/base64url'
import { isValidId } from '../crypto/ids'

const ROOT = 'linkedSpaces'

export interface LinkedSpace {
  spaceId: string
  name: string
  /** Bereichsschlüssel (base64url, 256 Bit). */
  key: string
  /** Gemeldete Dateien der Haushaltsgeräte im verknüpften Bereich. */
  files: Record<string, string>
}

const links = (doc: Y.Doc) => doc.getMap<unknown>(ROOT)

export function linkSpace(doc: Y.Doc, link: Omit<LinkedSpace, 'files'>): void {
  if (!isValidId(link.spaceId)) throw new Error('ungültige Bereichs-ID')
  const map = links(doc)
  doc.transact(() => {
    map.set(`${link.spaceId}/key`, link.key)
    map.set(`${link.spaceId}/name`, link.name)
  })
}

export function reportLinkedFile(
  doc: Y.Doc,
  spaceId: string,
  deviceId: string,
  fileId: string,
): void {
  if (!isValidId(spaceId) || !isValidId(deviceId) || !isValidId(fileId)) return
  const key = `${spaceId}/file/${deviceId}`
  if (links(doc).get(key) !== fileId) links(doc).set(key, fileId)
}

export function getLinkedSpaces(doc: Y.Doc): LinkedSpace[] {
  const bySpace = new Map<string, Partial<LinkedSpace> & { files: Record<string, string> }>()
  for (const [key, value] of links(doc)) {
    const [spaceId, field, deviceId] = key.split('/')
    if (!spaceId || !isValidId(spaceId) || typeof value !== 'string') continue
    const entry = bySpace.get(spaceId) ?? { spaceId, files: {} }
    bySpace.set(spaceId, entry)
    if (field === 'key') entry.key = value
    else if (field === 'name') entry.name = value
    else if (field === 'file' && deviceId && isValidId(deviceId) && isValidId(value)) {
      entry.files[deviceId] = value
    }
  }
  const out: LinkedSpace[] = []
  for (const entry of bySpace.values()) {
    if (!entry.key || !isValidKey(entry.key)) continue
    out.push({
      spaceId: entry.spaceId!,
      name: entry.name ?? '',
      key: entry.key,
      files: entry.files,
    })
  }
  return out
}

function isValidKey(value: string): boolean {
  try {
    return fromBase64url(value).length === 32
  } catch {
    return false
  }
}
