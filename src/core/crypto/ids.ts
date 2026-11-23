// SPDX-License-Identifier: AGPL-3.0-or-later

import { toBase64url } from './base64url'

/** IDs für Bereiche und Geräte: 128 Bit Zufall als base64url (22 Zeichen). */
export function randomId(): string {
  return toBase64url(crypto.getRandomValues(new Uint8Array(16)))
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** IDs landen in der AAD mit `/` als Trenner und dürfen ihn daher nie enthalten. */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}
