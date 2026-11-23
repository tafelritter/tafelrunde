// SPDX-License-Identifier: AGPL-3.0-or-later

import { type RemoteMeta, StorageError, type StorageProvider } from '@/core/base'

/**
 * Platzhalter, solange kein Speicheranbieter verbunden ist: Alles bleibt
 * lokal, fremde Dateien sind nicht erreichbar.
 */
export class LocalOnlyProvider implements StorageProvider {
  readonly id = 'local'

  canWrite(): boolean {
    return false
  }

  createFile(): Promise<string> {
    return Promise.reject(new StorageError('auth'))
  }

  updateFile(): Promise<void> {
    return Promise.reject(new StorageError('auth'))
  }

  readMeta(): Promise<RemoteMeta> {
    return Promise.reject(new StorageError('offline', 'kein Speicheranbieter verbunden'))
  }

  readFile(): Promise<Uint8Array> {
    return Promise.reject(new StorageError('offline', 'kein Speicheranbieter verbunden'))
  }
}
