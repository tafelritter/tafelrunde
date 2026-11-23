// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { toBase64url } from '../crypto/base64url'
import { exportSpaceKey, generateSpaceKey } from '../crypto/envelope'
import { randomId } from '../crypto/ids'
import {
  type JoinReply,
  type SpaceAccess,
  CodeError,
  codeLink,
  decodeCode,
  encodeCode,
} from './codes'

const GOOGLE = {
  clientId: '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com',
  apiKey: 'AIzaSyA-1234567890abcdefghijklmnopqrstu',
}

const raw = (o: unknown) => toBase64url(new TextEncoder().encode(JSON.stringify(o)))

async function invite(): Promise<SpaceAccess> {
  return {
    type: 'invite',
    spaceId: randomId(),
    key: await exportSpaceKey(await generateSpaceKey()),
    name: 'Familie',
    kind: 'household',
    peers: [{ deviceId: randomId(), provider: 'gdrive', files: { live: 'f-1', library: 'f-2' } }],
  }
}

const reply: JoinReply = {
  type: 'reply',
  spaceId: 'space1',
  deviceId: 'dev2',
  person: 'Ben',
  deviceName: 'Handy',
  provider: 'gdrive',
  files: { live: 'abc' },
}

describe('Codes', () => {
  it('kodieren Einladung, Wiederherstellung und Antwort verlustfrei', async () => {
    const inv = await invite()
    expect(decodeCode(encodeCode(inv))).toEqual(inv)
    const rec = { ...inv, type: 'recovery' as const }
    expect(decodeCode(encodeCode(rec))).toEqual(rec)
    expect(decodeCode(encodeCode(reply))).toEqual(reply)
  })

  it('nehmen die Google-Konfiguration mit und prüfen sie', async () => {
    const inv = { ...(await invite()), google: GOOGLE }
    expect(decodeCode(encodeCode(inv))).toEqual(inv)
    const body = JSON.parse(new TextDecoder().decode(Buffer.from(encodeCode(inv), 'base64url')))
    expect(() => decodeCode(raw({ ...body, g: { c: 'evil', a: GOOGLE.apiKey } }))).toThrow(
      /Google-Konfiguration ungültig/,
    )
    expect(() => decodeCode(raw({ ...body, g: 'x' }))).toThrow(CodeError)
  })

  it('sind kurz genug für einen QR-Code', async () => {
    const inv = await invite()
    inv.peers = Array.from({ length: 6 }, () => ({
      deviceId: randomId(),
      provider: 'gdrive',
      files: { live: 'x'.repeat(33), library: 'y'.repeat(33) },
    }))
    inv.google = GOOGLE
    // QR Version 40, Fehlerkorrektur M, Byte-Modus: 2331 Zeichen
    expect(codeLink('https://tafelrunde.niedermaier.bayern/', inv).length).toBeLessThan(2331)
  })

  it('legen den Schlüssel ins Fragment', async () => {
    const inv = await invite()
    const link = codeLink('https://example.org/app/?x=1#/liste', inv)
    const url = new URL(link)
    expect(url.pathname + url.search).toBe('/app/?x=1')
    expect(url.hash.startsWith('#/beitreten/')).toBe(true)
    expect(decodeCode(link)).toEqual(inv)
    expect(codeLink('https://e.org/', reply)).toContain('#/antwort/')
  })

  it('akzeptieren eingefügte Links mit Leerraum', async () => {
    const inv = await invite()
    expect(decodeCode(`  ${codeLink('https://e.org/', inv)}\n`)).toEqual(inv)
  })

  it('entfernen Steuer- und Bidi-Zeichen aus Texten', () => {
    const person = 'Ben\u0007\u202e\u2066'
    const code = raw({ v: 1, y: 'r', s: 'a', d: 'b', p: person, n: '', r: 'gdrive', f: {} })
    expect((decodeCode(code) as JoinReply).person).toBe('Ben')
  })

  const key = toBase64url(new Uint8Array(32))
  const base = { v: 1, y: 'i', s: 'a', k: key, n: 'X', t: 'household', m: [] }

  it.each([
    ['Unsinn', 'kein code!'],
    ['leer', ''],
    ['kein JSON', toBase64url(new TextEncoder().encode('{'))],
    ['Array', raw([])],
    ['andere Version', raw({ ...base, v: 2 })],
    ['unbekannte Art', raw({ ...base, y: 'x' })],
    ['kurzer Schlüssel', raw({ ...base, k: toBase64url(new Uint8Array(16)) })],
    ['ID mit Schrägstrich', raw({ ...base, s: 'a/b' })],
    ['unbekannte Bereichsart', raw({ ...base, t: 'evil' })],
    [
      'zu viele Geräte',
      raw({ ...base, m: Array.from({ length: 33 }, () => ({ d: 'a', r: 'g', f: {} })) }),
    ],
    ['kaputte Datei-ID', raw({ ...base, m: [{ d: 'a', r: 'g', f: { l: '../x' } }] })],
    ['zu langer Name', raw({ ...base, n: 'x'.repeat(101) })],
    ['zu langer Code', 'A'.repeat(9000)],
  ])('lehnen %s ab', (_, input) => {
    expect(() => decodeCode(input)).toThrow(CodeError)
  })
})
