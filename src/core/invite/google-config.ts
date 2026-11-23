// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Google-Konfiguration eines Geräts: OAuth-Client-ID und API-Key des
 * Google-Cloud-Projekts, das der Nutzer selbst angelegt hat. Beide Werte
 * sind öffentlich (sie stehen in jeder Anfrage), aber an Herkünfte gebunden.
 * Sie liegen nur auf dem Gerät und reisen in Einladungen mit, damit neue
 * Geräte ohne eigene Einrichtung lesen und schreiben können.
 */

export interface GoogleConfig {
  clientId: string
  apiKey: string
}

const CLIENT_ID = /^[0-9]{3,30}-[a-z0-9]{4,64}\.apps\.googleusercontent\.com$/
const API_KEY = /^[A-Za-z0-9_-]{20,64}$/

/** Prüft und bereinigt eine Konfiguration (Eingabe, Speicher oder Einladung); sonst `undefined`. */
export function parseGoogleConfig(value: unknown): GoogleConfig | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  const clientId = typeof v.clientId === 'string' ? v.clientId.trim() : ''
  const apiKey = typeof v.apiKey === 'string' ? v.apiKey.trim() : ''
  if (!CLIENT_ID.test(clientId) || !API_KEY.test(apiKey)) return undefined
  return { clientId, apiKey }
}

/** Was an einer Eingabe nicht stimmt (für das Formular). */
export function googleConfigErrors(input: { clientId: string; apiKey: string }): {
  clientId?: string
  apiKey?: string
} {
  const out: { clientId?: string; apiKey?: string } = {}
  if (!CLIENT_ID.test(input.clientId.trim()))
    out.clientId = 'Erwartet wird eine Client-ID wie 1234567890-abc….apps.googleusercontent.com'
  if (!API_KEY.test(input.apiKey.trim()))
    out.apiKey = 'Erwartet wird ein API-Schlüssel wie AIza… (Buchstaben, Ziffern, - und _)'
  return out
}

/** Projektnummer (vorderer Teil der Client-ID) – zur Anzeige, welches Projekt aktiv ist. */
export function googleProjectNumber(config: GoogleConfig): string {
  return config.clientId.split('-')[0] ?? ''
}
