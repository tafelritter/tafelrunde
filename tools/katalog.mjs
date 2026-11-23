// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Öffentlicher Katalog (Rezepte, Artikel, Nährwerte) aus Tafelritter/katalog.
 *
 *   node tools/katalog.mjs fetch           Release laut katalog.json holen, prüfen, nach public/catalog/ entpacken
 *   node tools/katalog.mjs update [tag]    neuestes (oder angegebenes) Release eintragen: Version und SHA-256
 *
 * Das Archiv wird nur mit passender SHA-256 aus katalog.json verwendet. Zum Testen eines
 * unveröffentlichten Katalogs: KATALOG_DATEI=<pfad.tar.gz> (dann ohne Prüfsummenvergleich).
 * Heruntergeladene Archive liegen in node_modules/.cache/tafelrunde-katalog/.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = join(root, 'katalog.json')
const TARGET = join(root, 'public', 'catalog')
const CACHE = join(root, 'node_modules', '.cache', 'tafelrunde-katalog')
const MARKER = '.katalog'

/** Nur diese Dateien darf das Archiv enthalten; Fotos höchstens 400 KB (wie im Katalog geprüft). */
const ALLOWED = [
  { pattern: /^(ingredients|recipes|nutrition)\.json$/, max: 5 * 1024 * 1024 },
  {
    pattern: /^images\/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*\.(webp|jpg)$/,
    max: 400 * 1024,
  },
]
const MAX_ARCHIVE = 50 * 1024 * 1024
const MAX_FILES = 2000

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function readConfig(file = CONFIG) {
  const c = JSON.parse(readFileSync(file, 'utf8'))
  if (!/^[\w.-]+\/[\w.-]+$/.test(c.repository ?? ''))
    throw new Error('katalog.json: repository ungültig')
  if (!/^v\d+\.\d+\.\d+$/.test(c.version ?? '')) throw new Error('katalog.json: version ungültig')
  if (!/^[0-9a-f]{64}$/.test(c.sha256 ?? '')) throw new Error('katalog.json: sha256 ungültig')
  return c
}

export const archiveName = (version) => `katalog-${version}.tar.gz`
export const archiveUrl = (c) =>
  `https://github.com/${c.repository}/releases/download/${c.version}/${archiveName(c.version)}`

/**
 * Liest ein ustar-Archiv (gzip). Nur reguläre Dateien und Ordner; Pfade und Größen
 * werden gegen ALLOWED geprüft – nichts landet außerhalb des Zielordners.
 */
export function untar(gz) {
  if (gz.length > MAX_ARCHIVE) throw new Error('Archiv zu groß')
  const tar = gunzipSync(gz, { maxOutputLength: MAX_ARCHIVE })
  const files = new Map()
  const text = (start, len) => {
    const raw = tar.subarray(start, start + len)
    const end = raw.indexOf(0)
    return raw.subarray(0, end < 0 ? len : end).toString('utf8')
  }
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const prefix = text(offset + 345, 155)
    const name = (prefix ? `${prefix}/` : '') + text(offset, 100)
    const size = parseInt(text(offset + 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(header[156] || 48)
    if (!Number.isFinite(size) || size < 0) throw new Error('Archiv beschädigt')
    const path = name.replace(/^\.\//, '')
    const body = offset + 512
    offset = body + Math.ceil(size / 512) * 512
    if (type === '5') continue
    if (type !== '0') throw new Error(`Archiv: Eintrag „${path}“ (Typ ${type}) nicht erlaubt`)
    const rule = ALLOWED.find((a) => a.pattern.test(path))
    if (!rule) throw new Error(`Archiv: unerwartete Datei „${path}“`)
    if (size > rule.max) throw new Error(`Archiv: „${path}“ zu groß`)
    if (files.has(path) || files.size >= MAX_FILES)
      throw new Error(`Archiv: „${path}“ doppelt oder zu viele Dateien`)
    if (body + size > tar.length) throw new Error('Archiv abgeschnitten')
    files.set(path, tar.subarray(body, body + size))
  }
  for (const name of ['ingredients.json', 'recipes.json'])
    if (!files.has(name)) throw new Error(`Archiv: ${name} fehlt`)
  return files
}

function install(files, label) {
  rmSync(TARGET, { recursive: true, force: true })
  for (const [path, bytes] of files) {
    const target = join(TARGET, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
  writeFileSync(join(TARGET, MARKER), label)
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function fetchKatalog() {
  const local = process.env.KATALOG_DATEI
  if (local) {
    const bytes = readFileSync(local)
    console.warn(`Katalog aus ${local} (ohne Prüfsummenvergleich, nur zum Testen)`)
    install(untar(bytes), `lokal ${sha256(bytes)}`)
    return
  }
  const c = readConfig()
  const label = `${c.version} ${c.sha256}`
  if (existsSync(join(TARGET, MARKER)) && readFileSync(join(TARGET, MARKER), 'utf8') === label)
    return
  const cached = join(CACHE, archiveName(c.version))
  let bytes = existsSync(cached) ? readFileSync(cached) : undefined
  if (!bytes || sha256(bytes) !== c.sha256) {
    bytes = await download(archiveUrl(c))
    const actual = sha256(bytes)
    if (actual !== c.sha256)
      throw new Error(
        `Prüfsumme passt nicht zu katalog.json: erwartet ${c.sha256}, erhalten ${actual}`,
      )
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(cached, bytes)
  }
  const files = untar(bytes)
  install(files, label)
  console.log(`Katalog ${c.version} → public/catalog/ (${files.size} Dateien)`)
}

/** Trägt ein Release ein: lädt das Archiv, prüft, ob es sich entpacken lässt, und speichert die SHA-256. */
export async function updateKatalog(tag) {
  const c = JSON.parse(readFileSync(CONFIG, 'utf8'))
  let version = tag
  if (!version) {
    const res = await fetch(`https://api.github.com/repos/${c.repository}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`Neuestes Release nicht gefunden: HTTP ${res.status}`)
    version = (await res.json()).tag_name
  }
  const next = { ...c, version }
  const bytes = await download(archiveUrl(next))
  untar(bytes)
  next.sha256 = sha256(bytes)
  writeFileSync(CONFIG, `${JSON.stringify(next, null, 2)}\n`)
  readConfig()
  console.log(`katalog.json: ${version} (${next.sha256})`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2)
  try {
    if (command === 'fetch') await fetchKatalog()
    else if (command === 'update') await updateKatalog(arg)
    else {
      console.error('Aufruf: node tools/katalog.mjs fetch | update [tag]')
      process.exit(2)
    }
  } catch (e) {
    console.error(`Katalog: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }
}
