// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Nachbildung von Google-Login und Drive-API für E2E-Tests. Alle Kontexte
 * eines Tests teilen sich einen Speicher, wie verschiedene Geräte, die auf
 * dieselben Drive-Dateien zugreifen. Nur so viel API, wie die App nutzt.
 */

import type { BrowserContext, Route } from '@playwright/test'

interface StoredFile {
  owner: string
  content: Buffer
  version: number
  shared: boolean
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
}

export class FakeGoogle {
  readonly files = new Map<string, StoredFile>()
  private counter = 0

  /** Hängt Login und Drive-API an einen Browser-Kontext; `account` steht für das Google-Konto. */
  async attach(context: BrowserContext, account: string): Promise<void> {
    const token = `token-${account}`
    await context.route('https://accounts.google.com/**', (route) => this.login(route, token))
    await context.route('https://www.googleapis.com/**', (route) =>
      this.drive(route, token, account),
    )
  }

  private async login(route: Route, token: string) {
    const url = new URL(route.request().url())
    const back = new URL(url.searchParams.get('redirect_uri')!)
    back.hash = new URLSearchParams({
      state: url.searchParams.get('state') ?? '',
      access_token: token,
      expires_in: '3600',
      token_type: 'Bearer',
      scope: url.searchParams.get('scope') ?? '',
    }).toString()
    await route.fulfill({ status: 302, headers: { Location: back.href } })
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private async drive(route: Route, token: string, account: string) {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const authorized = req.headers()['authorization'] === `Bearer ${token}`
    const path = url.pathname

    // Lesen per API-Key ohne Token
    const fileMatch = /^\/drive\/v3\/files\/([\w-]+)$/.exec(path)
    if (method === 'GET' && fileMatch && url.searchParams.get('key')) {
      const file = this.files.get(fileMatch[1])
      if (!file || !file.shared) return this.json(route, { error: { code: 404 } }, 404)
      if (url.searchParams.get('alt') === 'media') {
        return route.fulfill({ status: 200, headers: CORS, body: file.content })
      }
      return this.json(route, {
        md5Checksum: `v${file.version}`,
        modifiedTime: new Date().toISOString(),
        size: String(file.content.length),
      })
    }

    if (!authorized) return this.json(route, { error: { code: 401 } }, 401)

    if (path === '/drive/v3/files' && method === 'GET') return this.json(route, { files: [] })
    if (path === '/drive/v3/files' && method === 'POST')
      return this.json(route, { id: this.nextId() })
    if (path === '/upload/drive/v3/files' && method === 'POST') {
      const id = this.nextId()
      this.files.set(id, {
        owner: account,
        content: this.multipartContent(req.headers()['content-type'] ?? '', req.postDataBuffer()),
        version: 1,
        shared: false,
      })
      return this.json(route, { id })
    }
    const permission = /^\/drive\/v3\/files\/([\w-]+)\/permissions$/.exec(path)
    if (permission && method === 'POST') {
      const file = this.files.get(permission[1])
      if (!file || file.owner !== account) return this.json(route, {}, 404)
      file.shared = true
      return this.json(route, { id: 'perm' })
    }
    const upload = /^\/upload\/drive\/v3\/files\/([\w-]+)$/.exec(path)
    if (upload && method === 'PATCH') {
      const file = this.files.get(upload[1])
      if (!file || file.owner !== account) return this.json(route, {}, 404)
      file.content = req.postDataBuffer() ?? Buffer.alloc(0)
      file.version++
      return this.json(route, { id: upload[1] })
    }
    return this.json(route, { error: { code: 400, message: `${method} ${path}` } }, 400)
  }

  private nextId(): string {
    return `drivefile${++this.counter}`
  }

  /** Zweiter Teil eines multipart/related-Uploads ist der Dateiinhalt. */
  private multipartContent(contentType: string, body: Buffer | null): Buffer {
    const boundary = /boundary=([^;]+)/.exec(contentType)?.[1]
    if (!boundary || !body) return Buffer.alloc(0)
    const text = body.toString('latin1')
    const parts = text.split(`--${boundary}`)
    const media = parts[2] ?? ''
    const start = media.indexOf('\r\n\r\n') + 4
    return Buffer.from(media.slice(start, media.lastIndexOf('\r\n')), 'latin1')
  }
}
