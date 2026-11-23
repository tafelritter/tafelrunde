// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { googleConfigErrors, googleProjectNumber, parseGoogleConfig } from './google-config'

const ok = {
  clientId: '123456789012-abcdefghijklmnop.apps.googleusercontent.com',
  apiKey: 'AIzaSyA-1234567890abcdefghijklmnopqrstu',
}

describe('Google-Konfiguration', () => {
  it('nimmt gültige Werte und entfernt Leerraum', () => {
    expect(parseGoogleConfig({ clientId: ` ${ok.clientId}\n`, apiKey: ok.apiKey })).toEqual(ok)
    expect(googleProjectNumber(ok)).toBe('123456789012')
  })

  it.each([
    ['fremde Domain', { ...ok, clientId: '1-abcd.evil.example' }],
    ['Leerzeichen im Key', { ...ok, apiKey: 'AIza 123456789012345678901' }],
    ['zu kurzer Key', { ...ok, apiKey: 'AIza' }],
    ['kein Objekt', 'x'],
    ['fehlende Felder', {}],
  ])('lehnt ab: %s', (_, value) => {
    expect(parseGoogleConfig(value)).toBeUndefined()
  })

  it('erklärt Fehler je Feld', () => {
    expect(googleConfigErrors({ clientId: 'x', apiKey: ok.apiKey })).toHaveProperty('clientId')
    expect(googleConfigErrors(ok)).toEqual({})
  })
})
