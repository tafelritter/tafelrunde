// SPDX-License-Identifier: AGPL-3.0-or-later
// Wegwerf-Code für den Machbarkeitstest (Phase 0.2). Nicht in die App übernehmen.
import * as Y from 'yjs'
import { beginLogin, takeOAuthResult } from '../../src/providers/gdrive/oauth'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY ?? ''
const API = 'https://www.googleapis.com'
const SPACE = 'spike-space'
const DEVICE = localStorage.getItem('spike.device') ?? crypto.randomUUID()
localStorage.setItem('spike.device', DEVICE)

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const logEl = $('log')
function log(msg: string) {
  logEl.textContent = `${new Date().toISOString()} ${msg}\n` + (logEl.textContent ?? '')
}

// ---------- Token ----------
let token: { accessToken: string; expiresAt: number } | null = null

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('spike', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('kv')
    open.onsuccess = () => {
      const req = fn(open.result.transaction('kv', mode).objectStore('kv'))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error as Error)
    }
    open.onerror = () => reject(open.error as Error)
  })
}

function showToken() {
  $('token-state').textContent = token
    ? `Token gültig bis ${new Date(token.expiresAt).toLocaleTimeString()}`
    : 'kein Token'
}

async function initToken() {
  const result = takeOAuthResult(sessionStorage)
  if (result?.ok) {
    token = { accessToken: result.accessToken, expiresAt: result.expiresAt }
    log(`Login ok, Ablauf ${new Date(result.expiresAt).toLocaleTimeString()}`)
    if (localStorage.getItem('spike.persist') === '1')
      await idb('readwrite', (s) => s.put(token, 'token'))
  } else if (result) {
    log(`Login-Fehler: ${result.error}`)
  } else if (localStorage.getItem('spike.persist') === '1') {
    const stored = await idb<typeof token | undefined>('readonly', (s) => s.get('token'))
    if (stored && stored.expiresAt > Date.now() + 60_000) {
      token = stored
      log('Token aus IndexedDB übernommen')
    }
  }
  const redirects = Number(localStorage.getItem('spike.redirects') ?? '0')
  log(`Weiterleitungen bisher: ${redirects}`)
  showToken()
}

function login(silent: boolean) {
  localStorage.setItem(
    'spike.redirects',
    String(Number(localStorage.getItem('spike.redirects') ?? '0') + 1),
  )
  const redirectUri = `${location.origin}/auth/callback.html`
  location.assign(beginLogin({ clientId: CLIENT_ID, redirectUri, silent }, '#/', sessionStorage))
}

// ---------- Krypto (AES-256-GCM, AAD laut Architektur) ----------
const b64u = {
  enc: (b: Uint8Array) =>
    btoa(String.fromCharCode(...b))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, ''),
  dec: (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
}

async function key(): Promise<CryptoKey> {
  const raw = b64u.dec(($('key') as HTMLInputElement).value.trim())
  if (raw.length !== 32) throw new Error('Schlüssel muss 32 Byte haben')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

const aad = (device: string, seq: number) =>
  new TextEncoder().encode(`tafelrunde/v1/${SPACE}/live/${device}/${seq}`)

async function seal(update: Uint8Array) {
  const seq = Number(localStorage.getItem('spike.seq') ?? '0') + 1
  localStorage.setItem('spike.seq', String(seq))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad(DEVICE, seq) },
      await key(),
      new Uint8Array(update),
    ),
  )
  return JSON.stringify({
    v: 1,
    space: SPACE,
    doc: 'live',
    device: DEVICE,
    seq,
    iv: b64u.enc(iv),
    ct: b64u.enc(ct),
  })
}

const seenSeq = new Map<string, number>()
async function open(json: string): Promise<Uint8Array | null> {
  const f = JSON.parse(json) as { device: string; seq: number; iv: string; ct: string }
  if ((seenSeq.get(f.device) ?? 0) >= f.seq) {
    log(`seq ${f.seq} von ${f.device} nicht neuer – verworfen`)
    return null
  }
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64u.dec(f.iv), additionalData: aad(f.device, f.seq) },
    await key(),
    b64u.dec(f.ct),
  )
  seenSeq.set(f.device, f.seq)
  return new Uint8Array(plain)
}

// ---------- Yjs ----------
const doc = new Y.Doc()
const items = doc.getArray<string>('items')
const saved = localStorage.getItem('spike.doc')
if (saved) Y.applyUpdate(doc, b64u.dec(saved))
function render() {
  const list = $('list')
  list.replaceChildren(
    ...items.toArray().map((t) => Object.assign(document.createElement('li'), { textContent: t })),
  )
  localStorage.setItem('spike.doc', b64u.enc(Y.encodeStateAsUpdate(doc)))
}
items.observe(render)
render()

// ---------- Drive ----------
async function drive(path: string, init: RequestInit = {}) {
  if (!token) throw new Error('Kein Token – erst anmelden')
  const res = await fetch(API + path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token.accessToken}` },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res
}

async function createFile() {
  const meta = { name: crypto.randomUUID() + '.json', mimeType: 'application/json' }
  const res = await drive('/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  })
  const { id } = (await res.json()) as { id: string }
  await drive(`/drive/v3/files/${id}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'anyone', role: 'reader' }),
  })
  localStorage.setItem('spike.fileId', id)
  $('own-id').textContent = id
  log(`Datei angelegt und freigegeben: ${id}`)
}

async function write() {
  const id = localStorage.getItem('spike.fileId')
  if (!id) throw new Error('Erst Datei anlegen')
  const t0 = performance.now()
  await drive(`/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: await seal(Y.encodeStateAsUpdate(doc)),
  })
  log(`geschrieben in ${Math.round(performance.now() - t0)} ms`)
}

function publicFetch(url: string) {
  const referrerPolicy = ($('send-referrer') as HTMLInputElement).checked
    ? 'strict-origin'
    : 'no-referrer'
  return fetch(url, { referrerPolicy })
}

let lastMd5 = ''
async function read(): Promise<{ ms: number; status: number }> {
  const id = ($('other-id') as HTMLInputElement).value.trim()
  const t0 = performance.now()
  const meta = await publicFetch(
    `${API}/drive/v3/files/${id}?fields=modifiedTime,size,md5Checksum&key=${API_KEY}`,
  )
  const ms = performance.now() - t0
  if (!meta.ok) {
    log(`Metadaten: ${meta.status} ${await meta.text()}`)
    return { ms, status: meta.status }
  }
  const m = (await meta.json()) as { md5Checksum: string; modifiedTime: string; size: string }
  if (m.md5Checksum !== lastMd5) {
    lastMd5 = m.md5Checksum
    const body = await publicFetch(`${API}/drive/v3/files/${id}?alt=media&key=${API_KEY}`)
    if (!body.ok) {
      log(`Inhalt: ${body.status} ${await body.text()}`)
      return { ms, status: body.status }
    }
    const update = await open(await body.text())
    if (update) {
      Y.applyUpdate(doc, update)
      log(`zusammengeführt (${m.size} Byte, geändert ${m.modifiedTime})`)
    }
  }
  return { ms, status: meta.status }
}

// ---------- Abfrage-Messung ----------
let pollTimer: number | undefined
function poll() {
  const samples: number[] = []
  const errors = new Map<number, number>()
  const end = Date.now() + 60 * 60 * 1000
  const tick = async () => {
    try {
      const { ms, status } = await read()
      if (status === 200) samples.push(ms)
      else errors.set(status, (errors.get(status) ?? 0) + 1)
    } catch (e) {
      errors.set(0, (errors.get(0) ?? 0) + 1)
      log(`Abfragefehler: ${String(e)}`)
    }
    const sorted = [...samples].sort((a, b) => a - b)
    const p = (q: number) => Math.round(sorted[Math.floor(q * (sorted.length - 1))] ?? 0)
    $('poll-stats').textContent =
      `n=${samples.length} p50=${p(0.5)} ms p95=${p(0.95)} ms Fehler=${JSON.stringify(Object.fromEntries(errors))}`
    if (Date.now() < end) pollTimer = window.setTimeout(() => void tick(), 3000)
    else log(`Abfrage beendet: ${$('poll-stats').textContent}`)
  }
  void tick()
}

// ---------- Verdrahtung ----------
function on(id: string, fn: () => unknown) {
  $(id).addEventListener('click', () => {
    Promise.resolve()
      .then(fn)
      .catch((e: unknown) => log(`Fehler: ${String(e)}`))
  })
}
const persist = $('persist') as HTMLInputElement
persist.checked = localStorage.getItem('spike.persist') === '1'
persist.addEventListener('change', () => {
  localStorage.setItem('spike.persist', persist.checked ? '1' : '0')
  if (!persist.checked) void idb('readwrite', (s) => s.delete('token'))
})
;($('key') as HTMLInputElement).value = localStorage.getItem('spike.key') ?? ''
$('key').addEventListener('change', () =>
  localStorage.setItem('spike.key', ($('key') as HTMLInputElement).value),
)
$('own-id').textContent = localStorage.getItem('spike.fileId') ?? '–'

on('login', () => login(false))
on('silent', () => login(true))
on('newkey', () => {
  const k = b64u.enc(crypto.getRandomValues(new Uint8Array(32)))
  ;($('key') as HTMLInputElement).value = k
  localStorage.setItem('spike.key', k)
})
on('create', createFile)
on('write', write)
on('add', () => {
  const input = $('item') as HTMLInputElement
  if (input.value) items.push([`${input.value} (${DEVICE.slice(0, 4)})`])
  input.value = ''
})
on('read', read)
on('poll', poll)
on('stop', () => window.clearTimeout(pollTimer))
on('copy', () => navigator.clipboard.writeText(logEl.textContent ?? ''))

if (!CLIENT_ID || !API_KEY) log('VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_API_KEY fehlen in .env.local')
void initToken()
