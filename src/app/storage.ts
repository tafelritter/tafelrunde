// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Wahl des Speicheranbieters. Ohne Google-Konfiguration auf diesem Gerät
 * (eingegeben unter „Mit Google verbinden“ oder aus einer Einladung
 * übernommen, siehe google-config.ts) bleibt alles lokal.
 */

import { ref } from 'vue'
import type { StorageProvider } from '@/core/base'
import { GoogleDriveProvider } from '@/providers/gdrive/drive-provider'
import { GoogleAuth } from '@/providers/gdrive/google-auth'
import { LocalOnlyProvider } from '@/providers/local/local-only'
import { googleSetupInfo, loadGoogleConfig } from './google-config'

/** Aktive Konfiguration dieser Sitzung; Änderungen wirken nach einem Neustart der App. */
export const googleConfig = loadGoogleConfig()

/** Erhöht sich bei jeder Änderung des Anmeldestatus (für reaktive Anzeigen). */
export const authVersion = ref(0)

export const auth: GoogleAuth | undefined = googleConfig
  ? new GoogleAuth({
      clientId: googleConfig.clientId,
      redirectUri: googleSetupInfo().redirectUri,
      session: sessionStorage,
      local: localStorage,
      navigate: (url) => location.assign(url),
      onChange: () => authVersion.value++,
    })
  : undefined

export function createProvider(): StorageProvider {
  return auth && googleConfig
    ? new GoogleDriveProvider({ apiKey: googleConfig.apiKey, token: auth })
    : new LocalOnlyProvider()
}

/** Aktuelle Hash-Route als Rücksprungziel nach dem Login. */
export function currentRoute(): string {
  return location.hash || '#/'
}
