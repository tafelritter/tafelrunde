// SPDX-License-Identifier: AGPL-3.0-or-later

/** base64url ohne Auffüllzeichen (RFC 4648, Abschnitt 5). */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const LOOKUP = new Int16Array(128).fill(-1)
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i

export function toBase64url(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out +=
      ALPHABET[(n >> 18) & 63]! +
      ALPHABET[(n >> 12) & 63]! +
      ALPHABET[(n >> 6) & 63]! +
      ALPHABET[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]!
  }
  return out
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 4 === 1) throw new Error('base64url: ungültige Länge')
  const out = new Uint8Array(Math.floor((text.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let pos = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const value = code < 128 ? LOOKUP[code]! : -1
    if (value < 0) throw new Error('base64url: ungültiges Zeichen')
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[pos++] = (buffer >> bits) & 0xff
    }
  }
  // Nicht benötigte Restbits müssen null sein (kanonische Kodierung).
  if ((buffer & ((1 << bits) - 1)) !== 0) throw new Error('base64url: nicht kanonisch')
  return out
}
