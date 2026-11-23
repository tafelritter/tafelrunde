// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { isFramed } from './frame-guard'

describe('isFramed', () => {
  it('erkennt das Hauptfenster', () => {
    const win = {} as Window
    expect(isFramed({ self: win, top: win })).toBe(false)
  })
  it('erkennt einen Frame', () => {
    expect(isFramed({ self: {}, top: {} })).toBe(true)
  })
  it('wertet einen gesperrten Zugriff auf top als Frame', () => {
    const win = {
      self: {} as Window,
      get top(): Window {
        throw new DOMException('cross-origin')
      },
    }
    expect(isFramed(win)).toBe(true)
  })
})
