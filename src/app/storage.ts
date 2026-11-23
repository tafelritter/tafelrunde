// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Wahl des Speicheranbieters. Ohne konfiguriertes Google-Projekt
 * (`VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, siehe docs/setup/google-cloud.md)
 * bleibt alles lokal.
 */

import { ref } from 'vue'
import type { StorageProvider } from '@/core/base'
import { GoogleDriveProvider } from '@/providers/gdrive/drive-provider'
import { GoogleAuth } from '@/providers/gdrive/google-auth'
import { LocalOnlyProvider } from '@/providers/local/local-only'

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const apiKey = import.meta.env.VITE_GOOGLE_API_KEY

/** Erhöht sich bei jeder Änderung des Anmeldestatus (für reaktive Anzeigen). */
export const authVersion = ref(0)

export const auth: GoogleAuth | undefined =
  clientId && apiKey
    ? new GoogleAuth({
        clientId,
        redirectUri: new URL(`${import.meta.env.BASE_URL}auth/callback.html`, location.origin).href,
        session: sessionStorage,
        local: localStorage,
        navigate: (url) => location.assign(url),
        onChange: () => authVersion.value++,
      })
    : undefined

export function createProvider(): StorageProvider {
  return auth && apiKey ? new GoogleDriveProvider({ apiKey, token: auth }) : new LocalOnlyProvider()
}

/** Aktuelle Hash-Route als Rücksprungziel nach dem Login. */
export function currentRoute(): string {
  return location.hash || '#/'
}
