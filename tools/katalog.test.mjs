// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { archiveUrl, readConfig, sha256, untar } from './katalog.mjs'

/** Minimales ustar-Archiv wie im Release-Workflow des Katalogs. */
function tar(entries) {
  const blocks = []
  for (const { name, data = '', type = '0' } of entries) {
    const body = Buffer.from(data)
    const header = Buffer.alloc(512)
    header.write(name, 0, 100)
    header.write('0000644\0', 100)
    header.write('0000000\0', 108)
    header.write('0000000\0', 116)
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('00000000000\0', 136)
    header.write('        ', 148)
    header.write(type, 156)
    header.write('ustar\u000000', 257)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}
const base = [
  { name: 'ingredients.json', data: '{"items":[]}' },
  { name: 'recipes.json', data: '{"recipes":[]}' },
]

describe('Katalog-Archiv', () => {
  it('liest die erwarteten Dateien', () => {
    const files = untar(tar([...base, { name: 'images/backen/teig.webp', data: 'RIFF' }]))
    expect([...files.keys()]).toEqual([
      'ingredients.json',
      'recipes.json',
      'images/backen/teig.webp',
    ])
    expect(files.get('recipes.json').toString()).toBe('{"recipes":[]}')
  })

  it.each([
    ['Pfad nach außen', [{ name: '../evil.json', data: 'x' }], /unerwartete Datei/],
    ['absoluter Pfad', [{ name: '/etc/passwd', data: 'x' }], /unerwartete Datei/],
    ['fremde Datei', [{ name: 'index.html', data: 'x' }], /unerwartete Datei/],
    ['Symlink', [{ name: 'nutrition.json', type: '2' }], /nicht erlaubt/],
    ['zu großes Foto', [{ name: 'images/a.jpg', data: 'x'.repeat(401 * 1024) }], /zu groß/],
    ['doppelte Datei', [{ name: 'recipes.json', data: '{}' }], /doppelt/],
  ])('lehnt ab: %s', (_, extra, message) => {
    expect(() => untar(tar([...base, ...extra]))).toThrow(message)
  })

  it('verlangt Artikel und Rezepte', () => {
    expect(() => untar(tar([base[0]]))).toThrow(/recipes.json fehlt/)
  })
})

describe('katalog.json', () => {
  const dirs = []
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true })))
  const write = (content) => {
    const dir = mkdtempSync(join(tmpdir(), 'kj-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'k.json'), JSON.stringify(content))
    return join(dir, 'k.json')
  }

  it('baut die Release-Adresse', () => {
    const c = readConfig(
      write({ repository: 'Tafelritter/katalog', version: 'v1.2.3', sha256: sha256('x') }),
    )
    expect(archiveUrl(c)).toBe(
      'https://github.com/Tafelritter/katalog/releases/download/v1.2.3/katalog-v1.2.3.tar.gz',
    )
  })

  it('prüft die Felder', () => {
    expect(() => readConfig(write({ repository: 'a/b', version: 'latest', sha256: 'x' }))).toThrow(
      /version/,
    )
    expect(() =>
      readConfig(write({ repository: 'a/b', version: 'v1.0.0', sha256: 'abc' })),
    ).toThrow(/sha256/)
  })
})
