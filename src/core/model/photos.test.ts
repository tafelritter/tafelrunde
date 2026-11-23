// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { generateSpaceKey } from '../crypto/envelope'
import {
  MAX_PHOTOS_PER_RECIPE,
  addPhotoRef,
  listPhotos,
  openPhoto,
  removePhotoRef,
  sealPhoto,
  setPhotoFile,
} from './photos'

describe('Fotos', () => {
  it('verwaltet Verweise je Rezept', () => {
    const doc = new Y.Doc()
    const a = addPhotoRef(doc, {
      recipeId: 'r1',
      width: 1600,
      height: 1200,
      addedBy: 'p',
      addedAt: 2,
    })
    const b = addPhotoRef(doc, {
      recipeId: 'r1',
      width: 800,
      height: 600,
      addedBy: 'p',
      addedAt: 1,
    })
    addPhotoRef(doc, { recipeId: 'r2', width: 1, height: 1, addedBy: 'p', addedAt: 3 })
    setPhotoFile(doc, a, 'file-a')
    expect(listPhotos(doc, 'r1').map((p) => [p.id, p.fileId])).toEqual([
      [b, undefined],
      [a, 'file-a'],
    ])
    removePhotoRef(doc, b)
    expect(listPhotos(doc, 'r1').map((p) => p.id)).toEqual([a])
    expect(listPhotos(doc)).toHaveLength(2)
  })

  it('begrenzt die Zahl je Rezept', () => {
    const doc = new Y.Doc()
    for (let i = 0; i < MAX_PHOTOS_PER_RECIPE; i++) {
      addPhotoRef(doc, { recipeId: 'r', width: 1, height: 1, addedBy: 'p', addedAt: i })
    }
    expect(() =>
      addPhotoRef(doc, { recipeId: 'r', width: 1, height: 1, addedBy: 'p', addedAt: 99 }),
    ).toThrow()
  })

  it('verschlüsselt an Bereich und Foto gebunden', async () => {
    const key = await generateSpaceKey()
    const old = await generateSpaceKey()
    const bytes = new Uint8Array([1, 2, 3, 4])
    const file = await sealPhoto(key, 'space', 'photo1', bytes)
    expect(new TextDecoder().decode(file)).toContain('"doc":"photo"')
    expect(await openPhoto([old, key], 'space', 'photo1', file)).toEqual(bytes)
    await expect(openPhoto([key], 'space', 'photo2', file)).rejects.toThrow()
    await expect(openPhoto([key], 'other', 'photo1', file)).rejects.toThrow()
    await expect(openPhoto([old], 'space', 'photo1', file)).rejects.toThrow()
    await expect(sealPhoto(key, 'space', 'p', new Uint8Array(3 * 1024 * 1024))).rejects.toThrow(
      /zu groß/,
    )
  })
})
