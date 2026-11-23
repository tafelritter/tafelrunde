// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Über das Teilen-Menü übergebene Inhalte (Web Share Target, plan/06-phase-4-import-naehrwerte.md, 4.3).
 * Android ruft die App mit `?title=…&text=…&url=…` auf. Die Werte werden
 * sofort aus der Adresse entfernt und bis zur Import-Ansicht im Speicher gehalten.
 */

export interface SharedContent {
  title: string
  text: string
  url: string
}

let pending: SharedContent | undefined

/** Prüft die Startadresse; gibt `true` zurück, wenn etwas geteilt wurde. */
export function takeSharedFromLocation(loc: Location = window.location): boolean {
  const params = new URLSearchParams(loc.search)
  if (!['title', 'text', 'url'].some((k) => params.has(k))) return false
  const get = (k: string) => (params.get(k) ?? '').slice(0, 200_000)
  pending = { title: get('title').slice(0, 300), text: get('text'), url: get('url').slice(0, 2000) }
  // Inhalt nicht in Adresse und Verlauf stehen lassen.
  history.replaceState(null, '', `${loc.pathname}#/import?quelle=teilen`)
  return true
}

/** Einmal abholen. */
export function consumeShared(): SharedContent | undefined {
  const value = pending
  pending = undefined
  return value
}
