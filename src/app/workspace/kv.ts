// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Schlüssel-Wert-Ablage auf IndexedDB für Profil, Bereiche (inkl. Schlüssel
 * als `CryptoKey`) und Sync-Zustand. Werte werden per Structured Clone
 * gespeichert, `CryptoKey` also ohne Umweg über Text.
 */

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(prefix: string): Promise<string[]>
}

const STORE = 'kv'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB-Fehler'))
  })
}

export class IdbKeyValueStore implements KeyValueStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(name = 'tafelrunde'): Promise<IdbKeyValueStore> {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    return new IdbKeyValueStore(await request(req))
  }

  private store(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(STORE, mode).objectStore(STORE)
  }

  async get<T>(key: string): Promise<T | undefined> {
    return (await request(this.store('readonly').get(key))) as T | undefined
  }

  async set(key: string, value: unknown): Promise<void> {
    await request(this.store('readwrite').put(value, key))
  }

  async delete(key: string): Promise<void> {
    await request(this.store('readwrite').delete(key))
  }

  async keys(prefix: string): Promise<string[]> {
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`)
    const keys = await request(this.store('readonly').getAllKeys(range))
    return keys.filter((k): k is string => typeof k === 'string')
  }

  close(): void {
    this.db.close()
  }
}

export class MemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, unknown>()
  get<T>(key: string) {
    return Promise.resolve(this.data.get(key) as T | undefined)
  }
  set(key: string, value: unknown) {
    this.data.set(key, value)
    return Promise.resolve()
  }
  delete(key: string) {
    this.data.delete(key)
    return Promise.resolve()
  }
  keys(prefix: string) {
    return Promise.resolve([...this.data.keys()].filter((k) => k.startsWith(prefix)).sort())
  }
}
