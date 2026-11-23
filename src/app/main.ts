// SPDX-License-Identifier: AGPL-3.0-or-later
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { loadCatalog } from './catalog'
import { auth, currentRoute } from './storage'
import { initWorkspace } from './workspace/use-workspace'
import { isFramed } from './frame-guard'
import { takeSharedFromLocation } from './import/incoming'
import { applyStoredTheme } from '@/ui/theme'
import '@/ui/tokens.css'
import '@/ui/base.css'

if (isFramed(window)) {
  document.documentElement.dataset.framed = 'true'
  document.body.textContent = 'Tafelrunde kann nicht in einem fremden Rahmen angezeigt werden.'
} else {
  applyStoredTheme()
  // Über Android geteilter Rezepttext: vor dem Router aus der Adresse holen.
  const shared = takeSharedFromLocation()
  void loadCatalog()
  // Ergebnis einer Google-Anmeldung übernehmen, bevor irgendetwas schreibt.
  auth?.takeResult()
  createApp(App).use(router).mount('#app')
  if (shared)
    void router
      .isReady()
      .then(() => router.replace({ name: 'import', query: { quelle: 'teilen' } }))
  void initWorkspace().then(async (ws) => {
    if (!ws.profile) return
    await ws.startSync()
    if (auth?.accessToken()) await ws.flushAll()
    // Stille Erneuerung nur beim Start und nur, wenn wirklich etwas zu schreiben ist.
    else if (await ws.hasPendingChanges) auth?.renewSilentlyIfNeeded(currentRoute(), true)
  })
}
