// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * OAuth-Login per Weiterleitung (Implicit Flow, `response_type=token`) ohne Google-Skript.
 * Siehe plan/01-architektur.md, Abschnitt „Login per Weiterleitung“.
 */

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

export const STORAGE_KEYS = {
  state: 'tafelrunde.oauth.state',
  returnTo: 'tafelrunde.oauth.return',
  /** Übergabe von der Callback-Seite an die App; die App liest und löscht sofort. */
  result: 'tafelrunde.oauth.result',
} as const

export type OAuthResult =
  { ok: true; accessToken: string; expiresAt: number } | { ok: false; error: string }

export interface AuthRequest {
  clientId: string
  redirectUri: string
  /** `true` für die stille Erneuerung beim App-Start (`prompt=none`). */
  silent?: boolean
  loginHint?: string
}

/** Zufälliger `state` gegen untergeschobene Antworten. */
export function createState(random: Crypto = crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Nur App-interne Hash-Routen sind als Rücksprungziel zulässig (kein Open Redirect). */
export function sanitizeReturnTo(value: string | null | undefined): string {
  return value && /^#\/[\w\-/]*$/.test(value) ? value : '#/'
}

export function buildAuthUrl(req: AuthRequest, state: string): string {
  const params = new URLSearchParams({
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'false',
    state,
  })
  if (req.silent) params.set('prompt', 'none')
  if (req.loginHint) params.set('login_hint', req.loginHint)
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

/** Bereitet die Weiterleitung vor und liefert die Ziel-URL bei Google. */
export function beginLogin(req: AuthRequest, returnTo: string, storage: Storage): string {
  const state = createState()
  storage.setItem(STORAGE_KEYS.state, state)
  storage.setItem(STORAGE_KEYS.returnTo, sanitizeReturnTo(returnTo))
  return buildAuthUrl(req, state)
}

export function parseCallbackFragment(
  hash: string,
  expectedState: string | null,
  now: number,
): OAuthResult {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const state = params.get('state')
  if (!expectedState || state !== expectedState) return { ok: false, error: 'state_mismatch' }
  const error = params.get('error')
  if (error) return { ok: false, error }
  const accessToken = params.get('access_token')
  const expiresIn = Number(params.get('expires_in'))
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return { ok: false, error: 'invalid_response' }
  }
  const scopes = (params.get('scope') ?? '').split(' ')
  if (!scopes.includes(SCOPE)) return { ok: false, error: 'scope_missing' }
  return { ok: true, accessToken, expiresAt: now + expiresIn * 1000 }
}

/**
 * Wertet die Antwort aus, entfernt Token und Fragment sofort aus der URL und legt das
 * Ergebnis zur Übergabe ab. Liefert das Rücksprungziel (Hash-Route der App).
 */
export function completeOAuthCallback(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  storage: Storage,
  history: Pick<History, 'replaceState'>,
  now: number,
): string {
  const hash = location.hash
  history.replaceState(null, '', location.pathname + location.search)
  const result = parseCallbackFragment(hash, storage.getItem(STORAGE_KEYS.state), now)
  const returnTo = sanitizeReturnTo(storage.getItem(STORAGE_KEYS.returnTo))
  storage.removeItem(STORAGE_KEYS.state)
  storage.removeItem(STORAGE_KEYS.returnTo)
  storage.setItem(STORAGE_KEYS.result, JSON.stringify(result))
  return returnTo
}

/** Holt das Ergebnis der Callback-Seite genau einmal ab. */
export function takeOAuthResult(storage: Storage): OAuthResult | null {
  const raw = storage.getItem(STORAGE_KEYS.result)
  storage.removeItem(STORAGE_KEYS.result)
  if (!raw) return null
  try {
    return JSON.parse(raw) as OAuthResult
  } catch {
    return null
  }
}
