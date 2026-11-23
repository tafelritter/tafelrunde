// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Google-Konfiguration dieses Geräts (Client-ID, API-Key). Kein Build-Wert:
 * Jede Instanz – auch ein Fork unter eigener Adresse – funktioniert ohne
 * Änderung; das Projekt richtet der Nutzer selbst ein oder übernimmt es aus
 * einer Einladung. Die Werte sind öffentlich und liegen in localStorage,
 * Tokens dagegen nur im Arbeitsspeicher (Bedrohungsmodell T6, T28).
 */

import { type GoogleConfig, parseGoogleConfig } from '@/core/base'

const KEY = 'tafelrunde.google'
/** Beitritt, der nach dem Neustart mit der übernommenen Konfiguration fortgesetzt wird. */
const PENDING_JOIN = 'tafelrunde.join-nach-neustart'

export function loadGoogleConfig(storage: Storage = localStorage): GoogleConfig | undefined {
  try {
    const raw = storage.getItem(KEY)
    return raw ? parseGoogleConfig(JSON.parse(raw)) : undefined
  } catch {
    return undefined
  }
}

/** Speichert (oder entfernt mit `undefined`) die Konfiguration; wirkt nach dem nächsten Start. */
export function saveGoogleConfig(
  config: GoogleConfig | undefined,
  storage: Storage = localStorage,
) {
  if (!config) storage.removeItem(KEY)
  else {
    const valid = parseGoogleConfig(config)
    if (!valid) throw new Error('Google-Konfiguration ungültig')
    storage.setItem(KEY, JSON.stringify(valid))
  }
}

/** Adressen, die im Google-Projekt für diese Instanz eingetragen werden müssen. */
export function googleSetupInfo(loc: Location = location) {
  const base = new URL(import.meta.env.BASE_URL, loc.origin)
  return {
    origin: loc.origin,
    redirectUri: new URL('auth/callback.html', base).href,
    referrer: `${base.href}*`,
  }
}

export function rememberPendingJoin(code: string): void {
  sessionStorage.setItem(PENDING_JOIN, code)
}

/** Holt einen vorgemerkten Beitritt ab (einmalig). */
export function takePendingJoin(): string | undefined {
  const code = sessionStorage.getItem(PENDING_JOIN) ?? undefined
  sessionStorage.removeItem(PENDING_JOIN)
  return code
}
