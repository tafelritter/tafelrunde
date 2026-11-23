// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Token-Verwaltung für Google (plan/01-architektur.md, „Login per Weiterleitung“).
 *
 * Das Token liegt nur im Arbeitsspeicher (bis ADR 0001 anders entscheidet).
 * Beim Start übernimmt die App das Ergebnis der Callback-Seite. Fehlt ein
 * Token, aber es gibt etwas zu schreiben, versucht die App genau einmal je
 * Sitzung die stille Erneuerung (`prompt=none`).
 */

import type { TokenSource } from './drive-provider'
import { type OAuthResult, beginLogin, takeOAuthResult } from './oauth'

/** Fehler, bei denen Google eine Eingabe verlangt – dann „Anmeldung nötig“. */
const INTERACTION_ERRORS = new Set(['login_required', 'consent_required', 'interaction_required'])
/** Puffer, damit kein Token kurz vor Ablauf benutzt wird. */
const EXPIRY_MARGIN_MS = 60_000

const KEYS = {
  /** Dieses Gerät war schon einmal verbunden (localStorage, ohne Token). */
  connected: 'tafelrunde.gdrive.connected',
  /** Stille Erneuerung wurde in dieser Sitzung schon versucht (sessionStorage). */
  silentTried: 'tafelrunde.gdrive.silent-tried',
}

export interface GoogleAuthOptions {
  clientId: string
  redirectUri: string
  session: Storage
  local: Storage
  navigate: (url: string) => void
  now?: () => number
  onChange?: () => void
}

export class GoogleAuth implements TokenSource {
  private token: { accessToken: string; expiresAt: number } | undefined
  private lastErrorValue: string | undefined
  private readonly now: () => number

  constructor(private readonly o: GoogleAuthOptions) {
    this.now = o.now ?? Date.now
  }

  accessToken(): string | undefined {
    if (!this.token) return undefined
    if (this.token.expiresAt - EXPIRY_MARGIN_MS <= this.now()) {
      this.token = undefined
      this.o.onChange?.()
      return undefined
    }
    return this.token.accessToken
  }

  invalidate(): void {
    this.token = undefined
    this.o.onChange?.()
  }

  get lastError(): string | undefined {
    return this.lastErrorValue
  }

  /** War dieses Gerät schon einmal mit Google verbunden? */
  get wasConnected(): boolean {
    return this.o.local.getItem(KEYS.connected) === '1'
  }

  /** Ergebnis der Callback-Seite übernehmen (einmal beim Start). */
  takeResult(): OAuthResult | null {
    const result = takeOAuthResult(this.o.session)
    if (!result) return null
    if (result.ok) {
      this.token = { accessToken: result.accessToken, expiresAt: result.expiresAt }
      this.lastErrorValue = undefined
      this.o.local.setItem(KEYS.connected, '1')
      this.o.session.removeItem(KEYS.silentTried)
    } else {
      this.lastErrorValue = result.error
    }
    this.o.onChange?.()
    return result
  }

  /** Interaktive Anmeldung; `returnTo` ist die aktuelle Hash-Route. */
  login(returnTo: string): void {
    this.o.navigate(
      beginLogin(
        { clientId: this.o.clientId, redirectUri: this.o.redirectUri },
        returnTo,
        this.o.session,
      ),
    )
  }

  /**
   * Stille Erneuerung, wenn sinnvoll: Gerät war verbunden, kein gültiges
   * Token, Änderungen stehen aus, in dieser Sitzung noch nicht versucht und
   * die letzte Antwort verlangte keine Eingabe. Liefert true, wenn weitergeleitet wird.
   */
  renewSilentlyIfNeeded(returnTo: string, hasPendingChanges: boolean): boolean {
    if (!hasPendingChanges || !this.wasConnected || this.accessToken()) return false
    if (this.o.session.getItem(KEYS.silentTried) === '1') return false
    if (this.lastErrorValue && INTERACTION_ERRORS.has(this.lastErrorValue)) return false
    this.o.session.setItem(KEYS.silentTried, '1')
    this.o.navigate(
      beginLogin(
        { clientId: this.o.clientId, redirectUri: this.o.redirectUri, silent: true },
        returnTo,
        this.o.session,
      ),
    )
    return true
  }

  /** Abmelden auf diesem Gerät (Token verwerfen, nicht mehr still erneuern). */
  disconnect(): void {
    this.token = undefined
    this.o.local.removeItem(KEYS.connected)
    this.o.onChange?.()
  }
}
