// SPDX-License-Identifier: AGPL-3.0-or-later
// Erzeugt die PNG-Icons der PWA ohne Fremdabhängigkeit (Motiv wie public/icons/icon.svg).
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const GREEN = [0x2d, 0x6a, 0x4f]
const CREAM = [0xfa, 0xf8, 0xf5]
const GOLD = [0xe9, 0xc4, 0x6a]

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function icon(size, maskable) {
  const s = size / 512
  const radius = maskable ? 0 : 96 * s
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = [0]
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      const py = y + 0.5
      // Abgerundetes Quadrat
      const dx = Math.max(radius - px, 0, px - (size - radius))
      const dy = Math.max(radius - py, 0, py - (size - radius))
      const inside = dx * dx + dy * dy <= radius * radius
      let color = inside ? GREEN : null
      // Maskable: Motiv auf 80 % verkleinern (sichere Zone)
      const k = maskable ? 0.8 : 1
      const cx = (px - size / 2) / (s * k)
      const cy = (py - size / 2) / (s * k)
      const r = Math.hypot(cx, cy)
      if (inside) {
        if (Math.abs(r - 150) <= 14) color = CREAM
        if (r <= 88) color = GOLD
        for (const [ox, oy] of [
          [0, -184],
          [0, 184],
          [-184, 0],
          [184, 0],
        ]) {
          if (Math.hypot(cx - ox, cy - oy) <= 22) color = CREAM
        }
      }
      row.push(...(color ? [...color, 255] : [0, 0, 0, 0]))
    }
    rows.push(Buffer.from(row))
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const out = new URL('../public/icons/', import.meta.url)
writeFileSync(new URL('icon-192.png', out), icon(192, false))
writeFileSync(new URL('icon-512.png', out), icon(512, false))
writeFileSync(new URL('icon-maskable-512.png', out), icon(512, true))
console.log('Icons erzeugt.')
