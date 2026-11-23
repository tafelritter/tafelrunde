// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { readTheme, setTheme } from './theme'

describe('Farbschema', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })
  it('folgt ohne Einstellung dem System', () => {
    expect(readTheme()).toBe('system')
  })
  it('speichert Hell und Dunkel und setzt data-theme', () => {
    setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(readTheme()).toBe('dark')
  })
  it('entfernt die Einstellung bei System', () => {
    setTheme('light')
    setTheme('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(readTheme()).toBe('system')
  })
  it('ignoriert ungültige gespeicherte Werte', () => {
    localStorage.setItem('tafelrunde.theme', 'neon')
    expect(readTheme()).toBe('system')
  })
})
