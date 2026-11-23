// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { fromBase64url, toBase64url } from './base64url'
import {
  type EnvelopeHeader,
  EnvelopeError,
  decodeEnvelope,
  encodeEnvelope,
  exportSpaceKey,
  generateSpaceKey,
  importSpaceKey,
  openEnvelope,
  parseEnvelope,
  sealEnvelope,
} from './envelope'
import { isValidId, randomId } from './ids'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array) => new TextDecoder().decode(b)

const header: EnvelopeHeader = { space: 'space-A', doc: 'live', device: 'device-1', seq: 7 }
const expected = { space: 'space-A', doc: 'live', device: 'device-1' } as const

describe('base64url', () => {
  it('kodiert nach RFC 4648 ohne Auffüllung', () => {
    // Testvektoren aus RFC 4648, Abschnitt 10
    const cases: [string, string][] = [
      ['', ''],
      ['f', 'Zg'],
      ['fo', 'Zm8'],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg'],
      ['fooba', 'Zm9vYmE'],
      ['foobar', 'Zm9vYmFy'],
    ]
    for (const [plain, coded] of cases) {
      expect(toBase64url(enc(plain))).toBe(coded)
      expect(dec(fromBase64url(coded))).toBe(plain)
    }
  })

  it('nutzt - und _ statt + und /', () => {
    expect(toBase64url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_')
    expect([...fromBase64url('-_-_')]).toEqual([0xfb, 0xff, 0xbf])
  })

  it('lehnt ungültige Eingaben ab', () => {
    expect(() => fromBase64url('Zm9v=')).toThrow()
    expect(() => fromBase64url('Zm+v')).toThrow()
    expect(() => fromBase64url('Z')).toThrow()
    expect(() => fromBase64url('Zh')).toThrow() // nicht kanonisch
  })

  it('hält beliebige Bytes verlustfrei', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(1000))
    expect(fromBase64url(toBase64url(bytes))).toEqual(bytes)
  })
})

describe('IDs', () => {
  it('sind 22 Zeichen base64url und gültig', () => {
    const id = randomId()
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(isValidId(id)).toBe(true)
    expect(randomId()).not.toBe(id)
  })

  it('dürfen keinen Trenner enthalten', () => {
    expect(isValidId('a/b')).toBe(false)
    expect(isValidId('')).toBe(false)
    expect(isValidId(42)).toBe(false)
  })
})

describe('Schlüssel', () => {
  it('lässt sich exportieren und wieder importieren', async () => {
    const key = await generateSpaceKey()
    const raw = await exportSpaceKey(key)
    expect(fromBase64url(raw)).toHaveLength(32)
    const again = await importSpaceKey(raw)
    const env = await sealEnvelope(key, header, enc('hallo'))
    expect(dec(await openEnvelope(again, env, expected))).toBe('hallo')
  })

  it('lehnt falsche Längen ab', async () => {
    await expect(importSpaceKey(toBase64url(new Uint8Array(16)))).rejects.toThrow()
  })
})

describe('Umschlag', () => {
  // Fester Testvektor: Schlüssel 0x00..0x1f, IV 0xa0..0xab
  const fixedKey = toBase64url(Uint8Array.from({ length: 32 }, (_, i) => i))
  const fixedIv = Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i)

  it('erzeugt für feste Eingaben einen festen Chiffretext', async () => {
    const key = await importSpaceKey(fixedKey)
    const env = await sealEnvelope(key, header, enc('Milch, 2 l'), fixedIv)
    expect(env).toEqual({
      v: 1,
      space: 'space-A',
      doc: 'live',
      device: 'device-1',
      seq: 7,
      iv: 'oKGio6Slpqeoqaqr',
      ct: FIXED_CT,
    })
  })

  it('stimmt mit einer unabhängigen AES-GCM-Implementierung überein', async () => {
    const { createCipheriv } = await import('node:crypto')
    const cipher = createCipheriv('aes-256-gcm', fromBase64url(fixedKey), fixedIv)
    cipher.setAAD(enc('tafelrunde/v1/space-A/live/device-1/7'))
    const body = Buffer.concat([cipher.update(enc('Milch, 2 l')), cipher.final()])
    const reference = toBase64url(new Uint8Array(Buffer.concat([body, cipher.getAuthTag()])))
    expect(reference).toBe(FIXED_CT)
  })

  it('verschlüsselt jedes Mal mit neuem IV', async () => {
    const key = await generateSpaceKey()
    const a = await sealEnvelope(key, header, enc('x'))
    const b = await sealEnvelope(key, header, enc('x'))
    expect(a.iv).not.toBe(b.iv)
    expect(a.ct).not.toBe(b.ct)
  })

  it('übersteht Kodierung als Datei', async () => {
    const key = await generateSpaceKey()
    const env = await sealEnvelope(key, header, enc('Brot'))
    const back = decodeEnvelope(encodeEnvelope(env))
    expect(dec(await openEnvelope(key, back, expected))).toBe('Brot')
  })

  describe('Manipulation', () => {
    async function sealed() {
      const key = await generateSpaceKey()
      return { key, env: await sealEnvelope(key, header, enc('Eier')) }
    }

    it('erkennt veränderten Chiffretext', async () => {
      const { key, env } = await sealed()
      const ct = fromBase64url(env.ct)
      ct[0] = ct[0]! ^ 1
      await expect(
        openEnvelope(key, { ...env, ct: toBase64url(ct) }, expected),
      ).rejects.toMatchObject({
        reason: 'decrypt',
      })
    })

    it('erkennt veränderte seq (Rollback durch Umschreiben)', async () => {
      const { key, env } = await sealed()
      await expect(openEnvelope(key, { ...env, seq: 99 }, expected)).rejects.toMatchObject({
        reason: 'decrypt',
      })
    })

    it('erkennt vertauschte Dateien anderer Geräte', async () => {
      const { key, env } = await sealed()
      const fake = { ...env, device: 'device-2' }
      await expect(openEnvelope(key, fake, expected)).rejects.toMatchObject({ reason: 'binding' })
      // Auch wenn der Leser die Datei unter dem gefälschten Gerät erwartet:
      await expect(
        openEnvelope(key, fake, { ...expected, device: 'device-2' }),
      ).rejects.toMatchObject({
        reason: 'decrypt',
      })
    })

    it('erkennt vertauschte Dokumente', async () => {
      const { key, env } = await sealed()
      const fake = { ...env, doc: 'library' as const }
      await expect(openEnvelope(key, fake, { ...expected, doc: 'library' })).rejects.toMatchObject({
        reason: 'decrypt',
      })
    })

    it('scheitert mit falschem Schlüssel', async () => {
      const { env } = await sealed()
      const other = await generateSpaceKey()
      await expect(openEnvelope(other, env, expected)).rejects.toBeInstanceOf(EnvelopeError)
    })
  })

  describe('Formatprüfung', () => {
    const valid = {
      v: 1,
      space: 'a',
      doc: 'live',
      device: 'b',
      seq: 0,
      iv: 'oKGio6Slpqeoqaqr',
      ct: 'AA',
    }

    it('akzeptiert gültige Köpfe', () => {
      expect(parseEnvelope(valid)).toEqual(valid)
    })

    it.each([
      ['null', null],
      ['Array', []],
      ['falsche Version', { ...valid, v: 2 }],
      ['unbekanntes Dokument', { ...valid, doc: 'other' }],
      ['negative seq', { ...valid, seq: -1 }],
      ['Bruch als seq', { ...valid, seq: 1.5 }],
      ['seq als Text', { ...valid, seq: '1' }],
      ['Trenner in ID', { ...valid, space: 'a/b' }],
      ['fehlendes ct', { ...valid, ct: undefined }],
    ])('lehnt %s ab', (_, input) => {
      expect(() => parseEnvelope(input)).toThrow(EnvelopeError)
    })

    it('lehnt Nicht-JSON ab', () => {
      expect(() => decodeEnvelope(enc('{kaputt'))).toThrow(EnvelopeError)
      expect(() => decodeEnvelope(new Uint8Array([0xff, 0xfe]))).toThrow(EnvelopeError)
    })

    it('übernimmt keine zusätzlichen Felder', () => {
      const parsed = parseEnvelope({ ...valid, __proto__: { x: 1 }, extra: 'y' })
      expect(Object.keys(parsed).sort()).toEqual(
        ['ct', 'device', 'doc', 'iv', 'seq', 'space', 'v'].sort(),
      )
    })
  })
})

/** Mit unabhängiger Implementierung (Node `crypto`) gegengeprüft, siehe Test oben. */
const FIXED_CT = 'q3EQTi3nIo1CCXimvqkE6zN1Z-spNJ4nO84'
