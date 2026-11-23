// SPDX-License-Identifier: AGPL-3.0-or-later

import { type Ref, computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { SpaceHandle } from './workspace'
import { useDocVersion, useSyncSnapshot, workspace } from './use-workspace'

/** Bereich, dessen Status in der Kopfzeile erscheint und der schneller abgefragt wird. */
export const activeSpaceId = ref<string>()

export function useSpace(spaceId: Ref<string | undefined>, { active = false } = {}) {
  const handle = shallowRef<SpaceHandle>()
  const error = ref<string>()
  const doc = computed(() => handle.value?.doc)
  const sync = computed(() => handle.value?.sync)
  const version = useDocVersion(doc)
  const snapshot = useSyncSnapshot(sync)

  watch(
    spaceId,
    async (id) => {
      handle.value = undefined
      error.value = undefined
      if (!id) return
      try {
        const ws = await workspace()
        if (!ws.hasSpace(id)) throw new Error('Diesen Bereich gibt es auf diesem Gerät nicht.')
        const h = await ws.space(id)
        if (spaceId.value !== id) return
        handle.value = h
        if (active) {
          activeSpaceId.value = id
          await ws.startSync(id)
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
      }
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    if (active && activeSpaceId.value === spaceId.value) {
      activeSpaceId.value = undefined
      void workspace().then((ws) => ws.startSync())
    }
  })

  return { handle, doc, sync, version, snapshot, error }
}
