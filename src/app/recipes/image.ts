// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Fotos im Browser verkleinern (plan/04-phase-2-rezepte.md, 2.9): höchstens
 * 1600 px an der längsten Seite, WebP (Ersatz: JPEG). Das Neucodieren
 * entfernt dabei auch Metadaten wie den GPS-Standort aus dem Foto.
 */

import { MAX_PHOTO_BYTES } from '@/core/base'

const MAX_INPUT_BYTES = 40 * 1024 * 1024

export async function resizeImage(
  file: Blob,
  maxSide = 1600,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Das ist kein Bild.')
  if (file.size > MAX_INPUT_BYTES) throw new Error('Das Bild ist zu groß.')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Bild kann nicht verarbeitet werden.')
    ctx.drawImage(bitmap, 0, 0, width, height)
    for (const [type, quality] of [
      ['image/webp', 0.82],
      ['image/jpeg', 0.85],
      ['image/webp', 0.6],
      ['image/jpeg', 0.6],
    ] as const) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, quality),
      )
      if (blob && blob.type === type && blob.size <= MAX_PHOTO_BYTES) {
        return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
      }
    }
    throw new Error('Das Bild lässt sich nicht klein genug speichern.')
  } finally {
    bitmap.close()
  }
}

/** Bildtyp aus den ersten Bytes, damit nur Bilder als Bild angezeigt werden. */
export function imageType(bytes: Uint8Array): string | undefined {
  const b = bytes
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'image/webp'
  }
  return undefined
}
