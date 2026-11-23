// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Alle Rezepte aller Bereiche (und später des Katalogs) als reaktive Liste
 * und als Index für Referenzen. Eine Instanz je App; geparst wird nur, was
 * sich geändert hat.
 */

import { computed, shallowRef, watch } from 'vue'
import type * as Y from 'yjs'
import {
  type ParsedRecipe,
  type RecipeEntry,
  type RecipeIndex,
  type StoredRecipe,
  listRecipes,
  parseRecipe,
  spaceKind,
  spaceName,
} from '@/core'
import type { SpaceHandle } from '../workspace/workspace'
import { workspace, workspaceVersion } from '../workspace/use-workspace'

export interface AppRecipe extends RecipeEntry {
  spaceId: string
  id: string
  spaceName: string
  stored: StoredRecipe
}

const parsed = new Map<string, ParsedRecipe>()
/** Parst mit Cache (nach Quelltext); begrenzt, damit der Speicher nicht wächst. */
export function parseCached(source: string): ParsedRecipe {
  let result = parsed.get(source)
  if (!result) {
    result = parseRecipe(source)
    if (parsed.size > 500) parsed.delete(parsed.keys().next().value!)
    parsed.set(source, result)
  }
  return result
}

export const recipeKey = (spaceId: string, id: string) => `space:${spaceId}/${id}`

const version = shallowRef(0)
const handles = shallowRef<SpaceHandle[]>([])
const subscribed = new WeakSet<Y.Doc>()
/** Rezepte aus dem öffentlichen Katalog (2.10); setzt `catalog-recipes.ts`. */
export const catalogEntries = shallowRef<RecipeEntry[]>([])

let started = false
function start() {
  if (started) return
  started = true
  watch(
    workspaceVersion,
    async () => {
      const ws = await workspace()
      if (!ws.profile) return
      const list: SpaceHandle[] = []
      for (const record of ws.spaces()) {
        const h = await ws.space(record.id)
        if (!h.library) continue
        list.push(h)
        for (const doc of [h.doc, h.library.doc]) {
          if (subscribed.has(doc)) continue
          subscribed.add(doc)
          doc.on('update', () => version.value++)
        }
      }
      handles.value = list
    },
    { immediate: true },
  )
}

export function useRecipes() {
  start()
  const recipes = computed<AppRecipe[]>(() => {
    void version.value
    return handles.value.flatMap((h) => {
      const name = spaceName(h.doc) || (spaceKind(h.doc) === 'personal' ? 'Persönlich' : '')
      return listRecipes(h.library!.doc).map((stored) => ({
        key: recipeKey(h.record.id, stored.id),
        scope: h.record.id,
        spaceId: h.record.id,
        id: stored.id,
        spaceName: name,
        stored,
        recipe: parseCached(stored.source),
      }))
    })
  })
  const index = computed<RecipeIndex>(() => ({
    entries: [...recipes.value, ...catalogEntries.value],
  }))
  return { recipes, index, handles }
}
