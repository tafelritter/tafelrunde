// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Fotos zu Rezepten (plan/04-phase-2-rezepte.md, 2.9).
 *
 * Jedes Foto ist eine eigene verschlüsselte Datei im Speicher der Person,
 * die es hinzufügt. Im Dokument `library` stehen nur Verweise. Die AAD
 * bindet die Datei an Bereich und Foto-ID: Eine vertauschte Datei lässt
 * sich nicht entschlüsseln.
 */

import type * as Y from 'yjs'
import {
  type Envelope,
  decodeEnvelope,
  encodeEnvelope,
  openEnvelope,
  sealEnvelope,
} from '../crypto/envelope'
import { isValidId, randomId } from '../crypto/ids'

/** Obergrenze für ein (verkleinertes) Foto. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
/** Höchstens so viele Fotos je Rezept. */
export const MAX_PHOTOS_PER_RECIPE = 12

export interface PhotoRef {
  id: string
  recipeId: string
  /** Datei beim Speicheranbieter; fehlt, solange das Foto nur lokal liegt. */
  fileId?: string
  width: number
  height: number
  addedBy: string
  addedAt: number
}

const photos = (doc: Y.Doc) => doc.getMap<unknown>('photos')

export function addPhotoRef(
  doc: Y.Doc,
  p: Omit<PhotoRef, 'id' | 'fileId'> & { id?: string },
): string {
  if (!isValidId(p.recipeId)) throw new Error('ungültige Rezept-ID')
  if (listPhotos(doc, p.recipeId).length >= MAX_PHOTOS_PER_RECIPE) {
    throw new Error(`Höchstens ${MAX_PHOTOS_PER_RECIPE} Fotos je Rezept.`)
  }
  const id = p.id ?? randomId()
  const map = photos(doc)
  doc.transact(() => {
    map.set(`${id}/recipe`, p.recipeId)
    map.set(`${id}/width`, Math.round(p.width))
    map.set(`${id}/height`, Math.round(p.height))
    map.set(`${id}/by`, p.addedBy)
    map.set(`${id}/at`, p.addedAt)
  })
  return id
}

export function setPhotoFile(doc: Y.Doc, photoId: string, fileId: string): void {
  if (isValidId(fileId) && photos(doc).has(`${photoId}/recipe`)) {
    photos(doc).set(`${photoId}/file`, fileId)
  }
}

export function removePhotoRef(doc: Y.Doc, photoId: string): void {
  doc.transact(() => {
    for (const key of [...photos(doc).keys()]) {
      if (key.startsWith(`${photoId}/`)) photos(doc).delete(key)
    }
  })
}

export function listPhotos(doc: Y.Doc, recipeId?: string): PhotoRef[] {
  const byId = new Map<string, Partial<PhotoRef>>()
  for (const [key, value] of photos(doc)) {
    const [id, field] = key.split('/')
    if (!id || !isValidId(id)) continue
    const p = byId.get(id) ?? { id }
    byId.set(id, p)
    if (field === 'recipe' && typeof value === 'string') p.recipeId = value
    else if (field === 'file' && typeof value === 'string' && isValidId(value)) p.fileId = value
    else if (field === 'width' && typeof value === 'number') p.width = value
    else if (field === 'height' && typeof value === 'number') p.height = value
    else if (field === 'by' && typeof value === 'string') p.addedBy = value
    else if (field === 'at' && typeof value === 'number') p.addedAt = value
  }
  return [...byId.values()]
    .filter(
      (p): p is PhotoRef =>
        typeof p.recipeId === 'string' &&
        (!recipeId || p.recipeId === recipeId) &&
        typeof p.addedAt === 'number',
    )
    .map((p) => ({ ...p, width: p.width ?? 0, height: p.height ?? 0, addedBy: p.addedBy ?? '' }))
    .sort((a, b) => a.addedAt - b.addedAt || a.id.localeCompare(b.id))
}

export async function sealPhoto(
  key: CryptoKey,
  spaceId: string,
  photoId: string,
  bytes: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Foto ist zu groß.')
  const envelope = await sealEnvelope(
    key,
    { space: spaceId, doc: 'photo', device: photoId, seq: 0 },
    bytes,
  )
  return encodeEnvelope(envelope)
}

/** Entschlüsselt eine Fotodatei; probiert frühere Schlüssel nach einem Schlüsselwechsel. */
export async function openPhoto(
  keys: readonly CryptoKey[],
  spaceId: string,
  photoId: string,
  file: Uint8Array,
): Promise<Uint8Array> {
  const envelope: Envelope = decodeEnvelope(file)
  let lastError: unknown = new Error('kein Schlüssel')
  for (const key of keys) {
    try {
      const bytes = await openEnvelope(key, envelope, {
        space: spaceId,
        doc: 'photo',
        device: photoId,
      })
      if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Foto ist zu groß.')
      return bytes
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
