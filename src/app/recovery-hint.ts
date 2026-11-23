// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Hinweis auf den Wiederherstellungscode (plan/03-phase-1-einkaufsliste.md, 1.8):
 * erscheint je Bereich, bis der Code einmal angezeigt wurde. Nur eine
 * Merkhilfe auf diesem Gerät, daher localStorage.
 */

import { ref } from 'vue'

const key = (spaceId: string) => `tafelrunde.recovery-seen.${spaceId}`
export const recoveryHintVersion = ref(0)

export function recoverySeen(spaceId: string): boolean {
  try {
    return localStorage.getItem(key(spaceId)) === '1'
  } catch {
    return false
  }
}

export function markRecoverySeen(spaceId: string): void {
  try {
    localStorage.setItem(key(spaceId), '1')
  } catch {
    // Ohne Speicher erscheint der Hinweis eben erneut.
  }
  recoveryHintVersion.value++
}
