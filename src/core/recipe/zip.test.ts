// SPDX-License-Identifier: AGPL-3.0-or-later

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crc32, createZip, safeFileName } from './zip'

describe('ZIP', () => {
  it('berechnet CRC-32 nach Norm', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('erzeugt ein Archiv, das Standardwerkzeuge entpacken', () => {
    const zip = createZip([
      { name: 'Persönlich/Hefeteig.cook', content: '---\ntitle: Hefeteig\n---\n@Mehl{500%g}' },
      { name: 'Familie/Käsekuchen.cook', content: 'Ä Ö Ü ß' },
    ])
    const dir = mkdtempSync(join(tmpdir(), 'zip-'))
    try {
      const file = join(dir, 'backup.zip')
      writeFileSync(file, zip)
      // Python ist in CI und lokal vorhanden; prüft CRC und Struktur unabhängig.
      const names = execFileSync('python3', [
        '-c',
        'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("|".join(z.namelist()));print(z.read("Familie/Käsekuchen.cook").decode())',
        file,
      ]).toString()
      expect(names.trim().split('\n')).toEqual([
        'Persönlich/Hefeteig.cook|Familie/Käsekuchen.cook',
        'Ä Ö Ü ß',
      ])
      expect(readFileSync(file).length).toBe(zip.length)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('macht sichere Dateinamen', () => {
    expect(safeFileName('Käse/Kuchen: „gut“?')).toBe('Käse-Kuchen- „gut“')
    expect(safeFileName('../../etc')).toBe('etc')
    expect(safeFileName('   ')).toBe('Rezept')
  })
})
