// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Artikel-Grundkatalog: wird beim Start als statische Datei geladen
 * (`public/catalog/ingredients.json` aus dem Katalog-Release, geholt von tools/katalog.mjs) und vom
 * Service Worker für offline zwischengespeichert.
 */

import { shallowRef } from 'vue'
import {
  type CatalogIndex,
  type CatalogLookup,
  EMPTY_CATALOG,
  buildCatalogIndex,
} from '@/core/base'
import type { DietLookup } from '@/core/recipe/diet'

const index = shallowRef<CatalogIndex>(EMPTY_CATALOG)
let loading: Promise<void> | undefined

export function loadCatalog(): Promise<void> {
  loading ??= fetch(`${import.meta.env.BASE_URL}catalog/ingredients.json`)
    .then((res) => (res.ok ? (res.json() as Promise<unknown>) : undefined))
    .then((data) => {
      index.value = buildCatalogIndex(data)
    })
    .catch(() => {
      // Ohne Katalog funktioniert die Liste weiter, nur ohne Vorschläge und Kategorien.
      loading = undefined
    })
  return loading
}

/** Reaktiv: Computed-Werte, die das lesen, aktualisieren sich nach dem Laden. */
export const catalogLookup: CatalogLookup = (name) => index.value.lookup(name)

export function catalogNames(): string[] {
  return index.value.names
}

/** Katalog-ID und Anzeigename eines Artikels (reaktiv wie `catalogLookup`). */
export const catalogItem = (name: string) => index.value.item(name)

/** Ernährungsform eines Artikels laut Katalog (reaktiv wie `catalogLookup`). */
export const catalogDiet: DietLookup = (name) => index.value.diet(name)
