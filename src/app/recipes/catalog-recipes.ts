// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Öffentliche Rezepte aus dem Katalog (plan/04-phase-2-rezepte.md, 2.10).
 * Liegt als statische Datei neben der App und wird vom Service Worker
 * vorgehalten. Der Inhalt gilt trotzdem als nicht vertrauenswürdig.
 */

import { shallowRef } from 'vue'
import { MAX_RECIPE_CHARS } from '@/core/base'
import { catalogEntries, parseCached } from './recipe-store'

const PATH = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/

/** Version (Fingerabdruck) je Katalogpfad, für den Hinweis „Original geändert“. */
export const catalogVersions = shallowRef(new Map<string, string>())
export const catalogSources = shallowRef(new Map<string, string>())
/** Foto-Adresse je Katalogpfad (statische Datei der App). */
export const catalogImages = shallowRef(new Map<string, string>())
const IMAGE = /^images\/[a-z0-9/-]+\.(webp|jpg)$/

let loading: Promise<void> | undefined

export function loadCatalogRecipes(): Promise<void> {
  loading ??= fetch(`${import.meta.env.BASE_URL}catalog/recipes.json`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : undefined))
    .then((data) => {
      const list = (data as { recipes?: unknown } | undefined)?.recipes
      if (!Array.isArray(list)) return
      const versions = new Map<string, string>()
      const sources = new Map<string, string>()
      const images = new Map<string, string>()
      const entries = []
      for (const item of list as {
        path?: unknown
        source?: unknown
        version?: unknown
        image?: unknown
      }[]) {
        if (typeof item?.path !== 'string' || !PATH.test(item.path)) continue
        if (typeof item.source !== 'string' || item.source.length > MAX_RECIPE_CHARS) continue
        versions.set(item.path, typeof item.version === 'string' ? item.version : '')
        sources.set(item.path, item.source)
        if (
          typeof item.image === 'string' &&
          IMAGE.test(item.image) &&
          !item.image.includes('..')
        ) {
          images.set(item.path, `${import.meta.env.BASE_URL}catalog/${item.image}`)
        }
        entries.push({
          key: `catalog:${item.path}`,
          scope: 'catalog',
          path: item.path,
          recipe: parseCached(item.source),
        })
      }
      catalogVersions.value = versions
      catalogSources.value = sources
      catalogImages.value = images
      catalogEntries.value = entries
    })
    .catch(() => {
      loading = undefined
    })
  return loading
}
