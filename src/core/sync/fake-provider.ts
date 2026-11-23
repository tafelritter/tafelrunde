// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Speicheranbieter im Arbeitsspeicher für Tests. Mehrere Geräte teilen sich
 * eine `FakeCloud`; jedes Gerät bekommt einen eigenen `FakeProvider` mit
 * eigenem Konto. Schreiben darf nur der Besitzer, lesen alle.
 */

import { type RemoteMeta, StorageError, type StorageProvider } from './provider'

interface StoredFile {
  owner: string
  content: Uint8Array
  version: number
}

export class FakeCloud {
  readonly files = new Map<string, StoredFile>()
  /** Netz für alle getrennt. */
  offline = false
  private counter = 0
  /** Zahl der Lese- und Schreibzugriffe, für Tests. */
  readonly calls = { create: 0, update: 0, meta: 0, read: 0 }

  nextId(): string {
    return `file${++this.counter}`
  }

  /** Überschreibt eine Datei direkt, z. B. um Manipulation oder Rollback zu simulieren. */
  tamper(fileId: string, content: Uint8Array): void {
    const file = this.files.get(fileId)
    if (!file) throw new Error('unbekannte Datei')
    file.content = content
    file.version++
  }
}

export class FakeProvider implements StorageProvider {
  readonly id = 'fake'
  loggedIn = true
  /** Netz nur für dieses Gerät getrennt. */
  offline = false

  constructor(
    readonly cloud: FakeCloud,
    readonly account: string,
  ) {}

  private checkNetwork(): void {
    if (this.offline || this.cloud.offline) throw new StorageError('offline')
  }

  private checkAuth(): void {
    if (!this.loggedIn) throw new StorageError('auth')
  }

  canWrite(): boolean {
    return this.loggedIn
  }

  createFile(content: Uint8Array<ArrayBuffer>): Promise<string> {
    return Promise.resolve().then(() => {
      this.checkNetwork()
      this.checkAuth()
      this.cloud.calls.create++
      const id = this.cloud.nextId()
      this.cloud.files.set(id, { owner: this.account, content: content.slice(), version: 1 })
      return id
    })
  }

  updateFile(fileId: string, content: Uint8Array<ArrayBuffer>): Promise<void> {
    return Promise.resolve().then(() => {
      this.checkNetwork()
      this.checkAuth()
      this.cloud.calls.update++
      const file = this.cloud.files.get(fileId)
      if (!file) throw new StorageError('not-found')
      if (file.owner !== this.account) throw new StorageError('auth', 'fremde Datei')
      file.content = content.slice()
      file.version++
    })
  }

  readMeta(fileId: string): Promise<RemoteMeta> {
    return Promise.resolve().then(() => {
      this.checkNetwork()
      this.cloud.calls.meta++
      const file = this.cloud.files.get(fileId)
      if (!file) throw new StorageError('not-found')
      return { version: String(file.version), size: file.content.length }
    })
  }

  readFile(fileId: string): Promise<Uint8Array> {
    return Promise.resolve().then(() => {
      this.checkNetwork()
      this.cloud.calls.read++
      const file = this.cloud.files.get(fileId)
      if (!file) throw new StorageError('not-found')
      return file.content.slice()
    })
  }
}
