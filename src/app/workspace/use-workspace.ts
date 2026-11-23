// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Vue-Anbindung des Workspace: eine Instanz je App, reaktive Sicht auf
 * Yjs-Dokumente und Sync-Status.
 */

import { type Ref, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import type { DocSync, StorageProvider, SyncSnapshot } from '@/core/base'
import { createProvider } from '../storage'
import { IdbKeyValueStore } from './kv'
import { type DocPersistence, Workspace } from './workspace'

const persistDoc: DocPersistence = async (name, doc) => {
  const persistence = new IndexeddbPersistence(name, doc)
  await persistence.whenSynced
  return persistence
}

let instance: Promise<Workspace> | undefined
/** Wird erhöht, wenn sich Profil oder Bereichsliste ändern. */
export const workspaceVersion = ref(0)

export function initWorkspace(provider: StorageProvider = createProvider()) {
  instance ??= (async () => {
    const ws = await Workspace.open({ kv: await IdbKeyValueStore.open(), provider, persistDoc })
    // Automatisch beigetretene Bereiche (geteilte Listen des Haushalts) anzeigen.
    ws.onSpacesChanged = bumpWorkspace
    document.addEventListener('visibilitychange', () => {
      void ws.setVisible(document.visibilityState === 'visible')
    })
    return ws
  })()
  return instance
}

export function workspace(): Promise<Workspace> {
  return initWorkspace()
}

export function bumpWorkspace(): void {
  workspaceVersion.value++
}

/**
 * Liefert einen Zähler, der sich bei jeder Änderung des Dokuments erhöht.
 * Computed-Werte, die ihn lesen, werden dadurch neu berechnet.
 */
export function useDocVersion(doc: Ref<Y.Doc | undefined>): Ref<number> {
  const version = ref(0)
  const bump = () => version.value++
  watch(
    doc,
    (current, previous) => {
      previous?.off('update', bump)
      current?.on('update', bump)
      bump()
    },
    { immediate: true },
  )
  onScopeDispose(() => doc.value?.off('update', bump))
  return version
}

export function useSyncSnapshot(sync: Ref<DocSync | undefined>): Ref<SyncSnapshot | undefined> {
  const snapshot = shallowRef<SyncSnapshot>()
  let unsubscribe: (() => void) | undefined
  watch(
    sync,
    (current) => {
      unsubscribe?.()
      unsubscribe = current?.subscribe((s) => (snapshot.value = s))
      if (!current) snapshot.value = undefined
    },
    { immediate: true },
  )
  onScopeDispose(() => unsubscribe?.())
  return snapshot
}
