// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from 'vitest'
import { StorageError } from '@/core'
import { GoogleDriveProvider, type TokenSource } from './drive-provider'

interface Call {
  url: URL
  method: string
  headers: Headers
  body: unknown
  referrerPolicy: ReferrerPolicy | undefined
}

/** Einfache Nachbildung der Drive-API für die Tests. */
function fakeDrive(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: new URL(input instanceof Request ? input.url : input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
      referrerPolicy: init?.referrerPolicy,
    }
    calls.push(call)
    return handler(call)
  })
  return { calls, fetch: fetchMock as unknown as typeof fetch }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

function token(initial: string | null = 'tok'): TokenSource & { value: string | undefined } {
  const t = {
    value: initial ?? undefined,
    accessToken: () => t.value,
    invalidate: () => {
      t.value = undefined
    },
  }
  return t
}

const bytes = new TextEncoder().encode('{"v":1}')

describe('GoogleDriveProvider', () => {
  it('legt Ordner und Datei an und gibt sie per Link frei', async () => {
    const drive = fakeDrive(({ url, method }) => {
      if (url.pathname === '/drive/v3/files' && method === 'GET') return json({ files: [] })
      if (url.pathname === '/drive/v3/files' && method === 'POST') return json({ id: 'folder1' })
      if (url.pathname === '/upload/drive/v3/files') return json({ id: 'file1' })
      if (url.pathname === '/drive/v3/files/file1/permissions') return json({ id: 'perm' })
      return json({}, 500)
    })
    const p = new GoogleDriveProvider({ apiKey: 'KEY', token: token(), fetch: drive.fetch })
    expect(await p.createFile(bytes)).toBe('file1')

    const [search, folder, upload, permission] = drive.calls
    expect(search!.url.searchParams.get('q')).toBe(
      "name='Tafelrunde' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    )
    expect(JSON.parse(String(folder!.body))).toEqual({
      name: 'Tafelrunde',
      mimeType: 'application/vnd.google-apps.folder',
    })
    expect(upload!.url.searchParams.get('uploadType')).toBe('multipart')
    const multipart = await (upload!.body as Blob).text()
    expect(multipart).toContain('"parents":["folder1"]')
    expect(multipart).toMatch(/"name":"[A-Za-z0-9_-]{22}\.json"/)
    expect(multipart).toContain('{"v":1}')
    expect(JSON.parse(String(permission!.body))).toEqual({
      type: 'anyone',
      role: 'reader',
      allowFileDiscovery: false,
    })
    for (const c of drive.calls) {
      expect(c.headers.get('Authorization')).toBe('Bearer tok')
      expect(c.url.searchParams.has('key')).toBe(false)
    }
  })

  it('verwendet einen vorhandenen Ordner und sucht ihn nur einmal', async () => {
    let n = 0
    const drive = fakeDrive(({ url, method }) => {
      if (url.pathname === '/drive/v3/files' && method === 'GET')
        return json({ files: [{ id: 'f0' }] })
      if (url.pathname === '/upload/drive/v3/files') return json({ id: `file${++n}` })
      return json({ id: 'perm' })
    })
    const p = new GoogleDriveProvider({ apiKey: 'KEY', token: token(), fetch: drive.fetch })
    await p.createFile(bytes)
    await p.createFile(bytes)
    expect(drive.calls.filter((c) => c.url.pathname === '/drive/v3/files')).toHaveLength(1)
  })

  it('aktualisiert den Inhalt per PATCH', async () => {
    const drive = fakeDrive(() => json({ id: 'file1' }))
    const p = new GoogleDriveProvider({ apiKey: 'KEY', token: token(), fetch: drive.fetch })
    await p.updateFile('file1', bytes)
    const [call] = drive.calls
    expect(call!.method).toBe('PATCH')
    expect(call!.url.pathname).toBe('/upload/drive/v3/files/file1')
    expect(call!.url.searchParams.get('uploadType')).toBe('media')
    expect(call!.body).toBe(bytes)
  })

  it('liest fremde Dateien ohne Token per API-Key', async () => {
    const drive = fakeDrive(({ url }) =>
      url.searchParams.get('alt') === 'media'
        ? new Response(bytes)
        : json({ md5Checksum: 'abc', modifiedTime: '2026-11-23T10:00:00Z', size: '7' }),
    )
    const t = token(null)
    const p = new GoogleDriveProvider({ apiKey: 'K Y', token: t, fetch: drive.fetch })
    expect(p.canWrite()).toBe(false)
    expect(await p.readMeta('other')).toEqual({ version: 'abc', size: 7 })
    expect(await p.readFile('other')).toEqual(bytes)
    for (const c of drive.calls) {
      expect(c.url.searchParams.get('key')).toBe('K Y')
      expect(c.headers.has('Authorization')).toBe(false)
      expect(c.referrerPolicy).toBe('strict-origin')
    }
  })

  it('ohne Token wird nicht geschrieben', async () => {
    const drive = fakeDrive(() => json({}))
    const p = new GoogleDriveProvider({ apiKey: 'K', token: token(null), fetch: drive.fetch })
    await expect(p.updateFile('f', bytes)).rejects.toMatchObject({ kind: 'auth' })
    expect(drive.calls).toHaveLength(0)
  })

  it.each([
    [401, {}, 'auth'],
    [404, {}, 'not-found'],
    [403, { error: { errors: [{ reason: 'forbidden' }] } }, 'not-found'],
    [403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 'rate-limited'],
    [429, {}, 'rate-limited'],
    [500, {}, 'unavailable'],
    [503, {}, 'unavailable'],
  ])('übersetzt HTTP %i in %s', async (status, body, kind) => {
    const drive = fakeDrive(() => json(body, status))
    const p = new GoogleDriveProvider({ apiKey: 'K', token: token(), fetch: drive.fetch })
    await expect(p.readMeta('f')).rejects.toMatchObject({ kind })
  })

  it('verwirft das Token bei 401', async () => {
    const t = token()
    const drive = fakeDrive(() => json({}, 401))
    const p = new GoogleDriveProvider({ apiKey: 'K', token: t, fetch: drive.fetch })
    await expect(p.updateFile('f', bytes)).rejects.toMatchObject({ kind: 'auth' })
    expect(p.canWrite()).toBe(false)
  })

  it('übernimmt Retry-After', async () => {
    const drive = fakeDrive(() => json({}, 429, { 'Retry-After': '30' }))
    const p = new GoogleDriveProvider({ apiKey: 'K', token: token(), fetch: drive.fetch })
    await expect(p.readMeta('f')).rejects.toMatchObject({ retryAfterMs: 30_000 })
  })

  it('meldet Netzfehler als offline', async () => {
    const p = new GoogleDriveProvider({
      apiKey: 'K',
      token: token(),
      fetch: () => Promise.reject(new TypeError('Failed to fetch')),
    })
    await expect(p.readFile('f')).rejects.toEqual(new StorageError('offline'))
  })

  it('lehnt manipulierte Datei-IDs ab, bevor eine Anfrage rausgeht', async () => {
    const drive = fakeDrive(() => json({}))
    const p = new GoogleDriveProvider({ apiKey: 'K', token: token(), fetch: drive.fetch })
    await expect(p.readFile('../../about')).rejects.toMatchObject({ kind: 'not-found' })
    expect(drive.calls).toHaveLength(0)
  })

  it('sucht den Ordner nach einem Fehler erneut', async () => {
    let fail = true
    const drive = fakeDrive(({ url, method }) => {
      if (url.pathname === '/drive/v3/files' && method === 'GET') {
        if (fail) {
          fail = false
          return json({}, 503)
        }
        return json({ files: [{ id: 'f0' }] })
      }
      if (url.pathname === '/upload/drive/v3/files') return json({ id: 'file1' })
      return json({ id: 'perm' })
    })
    const p = new GoogleDriveProvider({ apiKey: 'K', token: token(), fetch: drive.fetch })
    await expect(p.createFile(bytes)).rejects.toMatchObject({ kind: 'unavailable' })
    expect(await p.createFile(bytes)).toBe('file1')
  })
})
