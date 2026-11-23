// SPDX-License-Identifier: AGPL-3.0-or-later
import { ref } from 'vue'
import { Workbox } from 'workbox-window'
import { trustedServiceWorkerUrl } from './trusted-types'

/**
 * Registriert den Service Worker und meldet neue Versionen (Hinweis statt stiller
 * Aktualisierung, damit keine laufende Eingabe verloren geht).
 */
export function useServiceWorker() {
  const needRefresh = ref(false)
  const offlineReady = ref(false)
  let wb: Workbox | undefined

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const url = trustedServiceWorkerUrl(`${import.meta.env.BASE_URL}sw.js`)
    wb = new Workbox(url, { scope: import.meta.env.BASE_URL })
    wb.addEventListener('waiting', () => (needRefresh.value = true))
    wb.addEventListener('activated', (event) => {
      if (!event.isUpdate) offlineReady.value = true
    })
    // Registrierung kann scheitern (privater Modus, gesperrter Speicher); die App läuft dann online weiter.
    wb.register().catch((error: unknown) =>
      console.warn('Service Worker nicht registriert:', error),
    )
  }

  function update() {
    if (!wb) return
    wb.addEventListener('controlling', () => window.location.reload())
    wb.messageSkipWaiting()
  }

  return { needRefresh, offlineReady, update }
}
