// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { GoogleAuth } from './google-auth'
import { STORAGE_KEYS } from './oauth'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  removeItem(k: string) {
    this.data.delete(k)
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

function setup(now = 1_000_000) {
  const session = new MemoryStorage()
  const local = new MemoryStorage()
  const navigations: URL[] = []
  let time = now
  const auth = new GoogleAuth({
    clientId: 'client',
    redirectUri: 'https://app.example/auth/callback.html',
    session,
    local,
    navigate: (url) => navigations.push(new URL(url)),
    now: () => time,
  })
  const deliver = (result: unknown) => session.setItem(STORAGE_KEYS.result, JSON.stringify(result))
  return { auth, session, local, navigations, deliver, tick: (ms: number) => (time += ms) }
}

describe('GoogleAuth', () => {
  it('übernimmt das Token aus der Callback-Seite und merkt sich die Verbindung', () => {
    const { auth, deliver } = setup()
    expect(auth.accessToken()).toBeUndefined()
    deliver({ ok: true, accessToken: 'tok', expiresAt: 1_000_000 + 3_600_000 })
    expect(auth.takeResult()).toMatchObject({ ok: true })
    expect(auth.accessToken()).toBe('tok')
    expect(auth.wasConnected).toBe(true)
    expect(auth.takeResult()).toBeNull()
  })

  it('verwirft das Token kurz vor Ablauf', () => {
    const { auth, deliver, tick } = setup()
    deliver({ ok: true, accessToken: 'tok', expiresAt: 1_000_000 + 3_600_000 })
    auth.takeResult()
    tick(3_600_000 - 61_000)
    expect(auth.accessToken()).toBe('tok')
    tick(2_000)
    expect(auth.accessToken()).toBeUndefined()
  })

  it('leitet zur Anmeldung mit state und Rücksprungziel weiter', () => {
    const { auth, navigations, session } = setup()
    auth.login('#/b/abc')
    const url = navigations[0]!
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file')
    expect(url.searchParams.get('state')).toBe(session.getItem(STORAGE_KEYS.state))
    expect(url.searchParams.has('prompt')).toBe(false)
    expect(session.getItem(STORAGE_KEYS.returnTo)).toBe('#/b/abc')
  })

  describe('stille Erneuerung', () => {
    function connected() {
      const s = setup()
      s.deliver({ ok: true, accessToken: 'tok', expiresAt: 1_000_000 + 100_000 })
      s.auth.takeResult()
      s.tick(100_000)
      return s
    }

    it('nur bei ausstehenden Änderungen und einmal je Sitzung', () => {
      const { auth, navigations } = connected()
      expect(auth.renewSilentlyIfNeeded('#/', false)).toBe(false)
      expect(auth.renewSilentlyIfNeeded('#/', true)).toBe(true)
      expect(navigations.at(-1)!.searchParams.get('prompt')).toBe('none')
      expect(auth.renewSilentlyIfNeeded('#/', true)).toBe(false)
      expect(navigations).toHaveLength(1)
    })

    it('nicht auf Geräten, die nie verbunden waren', () => {
      const { auth, navigations } = setup()
      expect(auth.renewSilentlyIfNeeded('#/', true)).toBe(false)
      expect(navigations).toHaveLength(0)
    })

    it('nicht, wenn Google eine Eingabe verlangt hat', () => {
      const { auth, deliver, session } = connected()
      session.clear()
      deliver({ ok: false, error: 'login_required' })
      auth.takeResult()
      expect(auth.lastError).toBe('login_required')
      expect(auth.renewSilentlyIfNeeded('#/', true)).toBe(false)
    })

    it('nicht nach dem Abmelden', () => {
      const { auth } = connected()
      auth.disconnect()
      expect(auth.renewSilentlyIfNeeded('#/', true)).toBe(false)
    })
  })
})
