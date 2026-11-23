// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Speicheranbieter Google Drive (plan/01-architektur.md, „Sync-Protokoll“).
 *
 * - Schreiben mit OAuth-Token, Scope `drive.file`: Die App sieht nur Dateien,
 *   die sie selbst angelegt hat. Dateien liegen im Ordner `Tafelrunde/` und
 *   haben zufällige Namen ohne Personenbezug.
 * - Jede Datei ist für „Jeder mit Link: Lesen“ freigegeben; andere Geräte
 *   lesen sie ohne Anmeldung per API-Key. Der Inhalt ist verschlüsselt.
 */

import {
  type RemoteMeta,
  StorageError,
  type StorageProvider,
  isValidId,
  randomId,
} from '@/core/base'

const API = 'https://www.googleapis.com'
const FOLDER_NAME = 'Tafelrunde'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

export interface TokenSource {
  /** Gültiges Zugriffstoken oder `undefined`, wenn eine Anmeldung nötig ist. */
  accessToken(): string | undefined
  /** Google hat das Token abgelehnt (401). */
  invalidate(): void
}

export interface DriveProviderOptions {
  apiKey: string
  token: TokenSource
  fetch?: typeof fetch
  /**
   * Referrer für Anfragen mit API-Key. Die App setzt global `no-referrer`;
   * ist der Key auf HTTP-Referrer beschränkt, muss hier `strict-origin`
   * stehen (sendet nur die Herkunft). Klärt ADR 0001.
   */
  keyReferrerPolicy?: ReferrerPolicy
}

function checkId(fileId: string): string {
  if (!isValidId(fileId)) throw new StorageError('not-found', 'ungültige Datei-ID')
  return encodeURIComponent(fileId)
}

/** Übersetzt HTTP-Antworten von Google in `StorageError`. */
async function toError(res: Response): Promise<StorageError> {
  let reason = ''
  try {
    const body = (await res.json()) as { error?: { errors?: { reason?: string }[] } }
    reason = body.error?.errors?.[0]?.reason ?? ''
  } catch {
    // Kein JSON – Status reicht.
  }
  const retryAfter = Number(res.headers.get('Retry-After'))
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined
  if (res.status === 401) return new StorageError('auth', 'Token abgelaufen oder ungültig')
  if (res.status === 429 || /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(reason)) {
    return new StorageError('rate-limited', `Kontingent: ${reason || res.status}`, retryAfterMs)
  }
  if (res.status === 404) return new StorageError('not-found')
  // 403 ohne Kontingent-Grund: Datei nicht (mehr) freigegeben oder App-Zugriff entzogen.
  if (res.status === 403) return new StorageError('not-found', `kein Zugriff: ${reason}`)
  return new StorageError('unavailable', `Drive antwortet ${res.status}`, retryAfterMs)
}

export class GoogleDriveProvider implements StorageProvider {
  readonly id = 'gdrive'
  private folderId: Promise<string> | undefined
  private readonly fetch: typeof fetch
  private readonly keyReferrerPolicy: ReferrerPolicy

  constructor(private readonly o: DriveProviderOptions) {
    this.fetch = o.fetch ?? globalThis.fetch.bind(globalThis)
    this.keyReferrerPolicy = o.keyReferrerPolicy ?? 'strict-origin'
  }

  canWrite(): boolean {
    return this.o.token.accessToken() !== undefined
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await this.fetch(url, { ...init, credentials: 'omit', cache: 'no-store' })
    } catch {
      throw new StorageError('offline')
    }
    if (!res.ok) {
      const error = await toError(res)
      if (error.kind === 'auth') this.o.token.invalidate()
      throw error
    }
    return res
  }

  private authorized(url: string, init: RequestInit = {}): Promise<Response> {
    const token = this.o.token.accessToken()
    if (!token) return Promise.reject(new StorageError('auth'))
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return this.request(url, { ...init, headers, referrerPolicy: 'no-referrer' })
  }

  private withKey(url: string): Promise<Response> {
    const sep = url.includes('?') ? '&' : '?'
    return this.request(`${url}${sep}key=${encodeURIComponent(this.o.apiKey)}`, {
      referrerPolicy: this.keyReferrerPolicy,
    })
  }

  /** Ordner `Tafelrunde/` suchen oder anlegen (mit `drive.file` nur eigene Ordner sichtbar). */
  private folder(): Promise<string> {
    this.folderId ??= (async () => {
      const q = `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`
      const found = (await (
        await this.authorized(
          `${API}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive&pageSize=1`,
        )
      ).json()) as { files?: { id?: string }[] }
      const existing = found.files?.[0]?.id
      if (existing) return existing
      const created = (await (
        await this.authorized(`${API}/drive/v3/files?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
        })
      ).json()) as { id?: string }
      if (!created.id) throw new StorageError('unavailable', 'Ordner ohne ID')
      return created.id
    })().catch((error: unknown) => {
      this.folderId = undefined
      throw error
    })
    return this.folderId
  }

  async createFile(content: Uint8Array<ArrayBuffer>): Promise<string> {
    const parent = await this.folder()
    const boundary = `tafelrunde-${randomId()}`
    const metadata = { name: `${randomId()}.json`, mimeType: 'application/json', parents: [parent] }
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ])
    const res = await this.authorized(
      `${API}/upload/drive/v3/files?uploadType=multipart&fields=id`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    )
    const { id } = (await res.json()) as { id?: string }
    if (!id || !isValidId(id)) throw new StorageError('unavailable', 'Datei ohne gültige ID')
    await this.authorized(`${API}/drive/v3/files/${checkId(id)}/permissions?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false }),
    })
    return id
  }

  async updateFile(fileId: string, content: Uint8Array<ArrayBuffer>): Promise<void> {
    await this.authorized(
      `${API}/upload/drive/v3/files/${checkId(fileId)}?uploadType=media&fields=id`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: content,
      },
    )
  }

  async readMeta(fileId: string): Promise<RemoteMeta> {
    const res = await this.withKey(
      `${API}/drive/v3/files/${checkId(fileId)}?fields=md5Checksum,modifiedTime,size`,
    )
    const meta = (await res.json()) as {
      md5Checksum?: string
      modifiedTime?: string
      size?: string
    }
    const version = meta.md5Checksum ?? meta.modifiedTime
    if (!version) throw new StorageError('unavailable', 'Metadaten unvollständig')
    return { version, size: Number(meta.size ?? 0) }
  }

  async readFile(fileId: string): Promise<Uint8Array> {
    const res = await this.withKey(`${API}/drive/v3/files/${checkId(fileId)}?alt=media`)
    return new Uint8Array(await res.arrayBuffer())
  }
}
