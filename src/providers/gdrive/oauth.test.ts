// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import {
  SCOPE,
  STORAGE_KEYS,
  beginLogin,
  buildAuthUrl,
  completeOAuthCallback,
  createState,
  parseCallbackFragment,
  sanitizeReturnTo,
  takeOAuthResult,
} from './oauth'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

const req = {
  clientId: 'cid.apps.googleusercontent.com',
  redirectUri: 'https://app.test/auth/callback.html',
}
const ok = (state: string) =>
  `#state=${state}&access_token=tok&expires_in=3599&token_type=Bearer&scope=${encodeURIComponent(SCOPE)}`

describe('buildAuthUrl', () => {
  it('fordert ausschließlich drive.file per Token-Flow an', () => {
    const url = new URL(buildAuthUrl(req, 's1'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('response_type')).toBe('token')
    expect(url.searchParams.get('scope')).toBe(SCOPE)
    expect(url.searchParams.get('state')).toBe('s1')
    expect(url.searchParams.has('prompt')).toBe(false)
  })
  it('setzt prompt=none für die stille Erneuerung', () => {
    const url = new URL(buildAuthUrl({ ...req, silent: true, loginHint: 'a@b.c' }, 's'))
    expect(url.searchParams.get('prompt')).toBe('none')
    expect(url.searchParams.get('login_hint')).toBe('a@b.c')
  })
})

describe('createState', () => {
  it('liefert 256 Bit als Hex und nie zweimal denselben Wert', () => {
    const a = createState()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(createState()).not.toBe(a)
  })
})

describe('sanitizeReturnTo', () => {
  it.each([
    ['#/listen/abc', '#/listen/abc'],
    [null, '#/'],
    ['https://evil.example', '#/'],
    ['//evil.example', '#/'],
    ['#/x?y=<script>', '#/'],
  ])('%s → %s', (input, expected) => {
    expect(sanitizeReturnTo(input)).toBe(expected)
  })
})

describe('parseCallbackFragment', () => {
  it('übernimmt Token und Ablaufzeit', () => {
    expect(parseCallbackFragment(ok('s'), 's', 1000)).toEqual({
      ok: true,
      accessToken: 'tok',
      expiresAt: 1000 + 3599_000,
    })
  })
  it('lehnt falschen oder fehlenden state ab', () => {
    expect(parseCallbackFragment(ok('x'), 's', 0)).toEqual({ ok: false, error: 'state_mismatch' })
    expect(parseCallbackFragment(ok('s'), null, 0)).toEqual({ ok: false, error: 'state_mismatch' })
  })
  it('reicht Google-Fehler wie login_required durch', () => {
    expect(parseCallbackFragment('#state=s&error=login_required', 's', 0)).toEqual({
      ok: false,
      error: 'login_required',
    })
  })
  it('lehnt Antworten ohne den Scope drive.file ab', () => {
    expect(
      parseCallbackFragment('#state=s&access_token=t&expires_in=10&scope=email', 's', 0),
    ).toEqual({
      ok: false,
      error: 'scope_missing',
    })
  })
  it('lehnt unvollständige Antworten ab', () => {
    expect(parseCallbackFragment('#state=s&access_token=t', 's', 0)).toEqual({
      ok: false,
      error: 'invalid_response',
    })
  })
})

describe('Ablauf über die Callback-Seite', () => {
  it('entfernt das Token aus der URL, übergibt es genau einmal und springt zurück', () => {
    const storage = new MemoryStorage()
    const authUrl = new URL(beginLogin(req, '#/listen', storage))
    const state = authUrl.searchParams.get('state')!
    const history = { replaceState: vi.fn() }

    const target = completeOAuthCallback(
      { hash: ok(state), pathname: '/auth/callback.html', search: '' },
      storage,
      history,
      0,
    )

    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/auth/callback.html')
    expect(target).toBe('#/listen')
    expect(storage.getItem(STORAGE_KEYS.state)).toBeNull()
    expect(takeOAuthResult(storage)).toMatchObject({ ok: true, accessToken: 'tok' })
    expect(takeOAuthResult(storage)).toBeNull()
  })
  it('verwirft eine Antwort, die nicht zu einem eigenen Login gehört', () => {
    const storage = new MemoryStorage()
    const history = { replaceState: vi.fn() }
    completeOAuthCallback({ hash: ok('fremd'), pathname: '/a', search: '' }, storage, history, 0)
    expect(takeOAuthResult(storage)).toEqual({ ok: false, error: 'state_mismatch' })
  })
  it('ignoriert beschädigte Übergabedaten', () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.result, '{kaputt')
    expect(takeOAuthResult(storage)).toBeNull()
  })
})
