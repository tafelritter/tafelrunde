// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Sync eines Yjs-Dokuments eines Bereichs (plan/01-architektur.md, „Sync-Protokoll“).
 *
 * - Schreiben: Jede Änderung (auch eine von anderen Geräten übernommene)
 *   führt nach einer Entprellung dazu, dass der vollständige, zusammengeführte
 *   Stand verschlüsselt in die eigene Datei geschrieben wird. So reicht jede
 *   einzelne Datei, um den Bereich wiederherzustellen, und Änderungen
 *   erreichen auch Geräte, die den Urheber (noch) nicht kennen.
 * - Lesen: Für jedes andere Gerät werden die Metadaten abgefragt und nur bei
 *   Änderung der Inhalt geladen, entschlüsselt und per `Y.applyUpdate`
 *   zusammengeführt.
 * - Rollback-Schutz: Pro Gerät wird die höchste gesehene `seq` gespeichert;
 *   ältere Stände werden verworfen.
 */

import * as Y from 'yjs'
import {
  type DocKind,
  type Envelope,
  EnvelopeError,
  decodeEnvelope,
  encodeEnvelope,
  openEnvelope,
  sealEnvelope,
} from '../crypto/envelope'
import { toBase64url } from '../crypto/base64url'
import { StorageError, type StorageProvider } from './provider'

export const REMOTE_ORIGIN = Symbol('tafelrunde-remote')

export interface PeerState {
  /** Höchste übernommene `seq`. */
  seq: number
  /** Zuletzt gesehene Version der Datei laut Anbieter. */
  version?: string
}

export interface PersistedSyncState {
  ownFileId?: string
  seq: number
  /** State Vector des zuletzt erfolgreich geschriebenen Stands (base64url). */
  written?: string
  peers: Record<string, PeerState>
}

/** Speicher für den Sync-Zustand je Bereich und Dokument (IndexedDB, in Tests Arbeitsspeicher). */
export interface SyncStateStore {
  load(key: string): Promise<PersistedSyncState | undefined>
  save(key: string, state: PersistedSyncState): Promise<void>
}

export class MemorySyncStateStore implements SyncStateStore {
  readonly data = new Map<string, PersistedSyncState>()
  load(key: string) {
    const s = this.data.get(key)
    return Promise.resolve(s ? structuredClone(s) : undefined)
  }
  save(key: string, state: PersistedSyncState) {
    this.data.set(key, structuredClone(state))
    return Promise.resolve()
  }
}

export interface Peer {
  deviceId: string
  fileId: string
}

export type PeerProblem = 'not-found' | 'undecryptable' | 'rollback'

export type SyncStatus =
  'local' | 'synced' | 'pending' | 'offline' | 'login-required' | 'member-unreachable'

export interface SyncSnapshot {
  status: SyncStatus
  /** Zeitpunkt des letzten vollständig erfolgreichen Abgleichs (ms). */
  lastSyncAt?: number
  /** Geräte, deren Datei gerade nicht nutzbar ist. */
  problems: Record<string, PeerProblem>
}

export interface DocSyncOptions {
  doc: Y.Doc
  kind: DocKind
  spaceId: string
  key: CryptoKey
  /**
   * Frühere Schlüssel nach einem Schlüsselwechsel: nur zum Lesen von Geräten,
   * die den neuen Schlüssel noch nicht übernommen haben. Geschrieben wird
   * immer mit `key`.
   */
  previousKeys?: CryptoKey[]
  deviceId: string
  provider: StorageProvider
  store: SyncStateStore
  /** Aktuelle Liste der anderen Geräte und ihrer Dateien. */
  peers: () => Peer[]
  /** Wird aufgerufen, sobald die eigene Datei angelegt ist (zum Eintragen ins Register). */
  onOwnFile?: (fileId: string) => void
  debounceMs?: number
  now?: () => number
}

export class DocSync {
  private state: PersistedSyncState = { seq: 0, peers: {} }
  private readonly storeKey: string
  private readonly debounceMs: number
  private readonly now: () => number
  private dirty = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private writing: Promise<void> | undefined
  private polling: Promise<void> | undefined
  private networkError: 'offline' | undefined
  private lastSyncAt: number | undefined
  private problems: Record<string, PeerProblem> = {}
  private readonly listeners = new Set<(s: SyncSnapshot) => void>()
  private started = false
  private readonly onUpdate = () => this.markDirty()

  constructor(private readonly o: DocSyncOptions) {
    this.storeKey = `${o.spaceId}/${o.kind}`
    this.debounceMs = o.debounceMs ?? 1500
    this.now = o.now ?? Date.now
  }

  get ownFileId(): string | undefined {
    return this.state.ownFileId
  }

  /** Lädt den gespeicherten Zustand und beginnt, Änderungen zu beobachten. */
  async start(): Promise<void> {
    if (this.started) return
    this.state = (await this.o.store.load(this.storeKey)) ?? { seq: 0, peers: {} }
    this.started = true
    this.o.doc.on('update', this.onUpdate)
    // Ungeschriebene Änderungen aus einer früheren Sitzung (oder noch nie geschrieben,
    // aber schon Inhalt vorhanden): Der aktuelle Stand weicht vom zuletzt geschriebenen ab.
    const current = Y.encodeStateVector(this.o.doc)
    const hasContent = current.length > 1
    if (hasContent && this.state.written !== toBase64url(current)) this.markDirty()
    this.emit()
  }

  stop(): void {
    this.o.doc.off('update', this.onUpdate)
    clearTimeout(this.timer)
    this.timer = undefined
    this.started = false
  }

  subscribe(listener: (s: SyncSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot(): SyncSnapshot {
    const snap: SyncSnapshot = { status: this.status(), problems: { ...this.problems } }
    if (this.lastSyncAt !== undefined) snap.lastSyncAt = this.lastSyncAt
    return snap
  }

  private status(): SyncStatus {
    // Nie synchronisiert und allein: Das ist ein rein lokaler Bereich, keine fehlende Anmeldung.
    const isolated = !this.state.ownFileId && this.o.peers().length === 0
    if (this.dirty && !this.o.provider.canWrite()) return isolated ? 'local' : 'login-required'
    if (this.networkError) return 'offline'
    if (this.dirty || this.writing) return 'pending'
    if (Object.keys(this.problems).length > 0) return 'member-unreachable'
    if (isolated) return 'local'
    return 'synced'
  }

  private emit(): void {
    const snap = this.snapshot()
    for (const l of this.listeners) l(snap)
  }

  // --- Schreiben --------------------------------------------------------------

  private markDirty(): void {
    if (!this.started) return
    const wasDirty = this.dirty
    this.dirty = true
    // Während eines Wartens nach Fehler nicht ständig neu versuchen.
    if (this.retryDelay > 0 && this.timer) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, this.debounceMs)
    if (!wasDirty) this.emit()
  }

  /**
   * Schlüsselwechsel im laufenden Betrieb: Ab sofort wird mit `key`
   * geschrieben; `previousKeys` dienen nur noch zum Lesen. Der eigene Stand
   * wird mit dem neuen Schlüssel neu geschrieben.
   */
  setKeys(key: CryptoKey, previousKeys: CryptoKey[]): void {
    this.o.key = key
    this.o.previousKeys = previousKeys
    // Bei Peers, die jetzt anders entschlüsselt werden, Inhalt erneut prüfen.
    for (const peer of Object.values(this.state.peers)) delete peer.version
    this.markDirty()
  }

  /** Hat das Gerät noch nicht geschriebene Änderungen? */
  get hasPendingChanges(): boolean {
    return this.dirty
  }

  /** Wartet, bis laufende Schreib- und Lesevorgänge abgeschlossen sind. */
  async idle(): Promise<void> {
    while (this.writing ?? this.polling) {
      await Promise.allSettled([this.writing, this.polling])
    }
  }

  /**
   * Schreibt ausstehende Änderungen sofort. Läuft bereits ein Schreibvorgang,
   * wird danach erneut geschrieben; es läuft nie mehr als einer gleichzeitig.
   */
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    while (this.writing) await this.writing
    if (!this.dirty || !this.started) return
    if (!this.o.provider.canWrite()) {
      this.emit()
      return
    }
    this.writing = this.writeOnce().finally(() => {
      this.writing = undefined
      this.emit()
    })
    await this.writing
  }

  private async writeOnce(): Promise<void> {
    this.dirty = false
    this.emit()
    const seq = this.state.seq + 1
    // seq vor dem Hochladen festschreiben: lieber eine Lücke als eine doppelte seq.
    this.state.seq = seq
    await this.o.store.save(this.storeKey, this.state)
    try {
      const written = toBase64url(Y.encodeStateVector(this.o.doc))
      const envelope = await sealEnvelope(
        this.o.key,
        { space: this.o.spaceId, doc: this.o.kind, device: this.o.deviceId, seq },
        Y.encodeStateAsUpdate(this.o.doc),
      )
      const bytes = encodeEnvelope(envelope)
      if (this.state.ownFileId) {
        await this.o.provider.updateFile(this.state.ownFileId, bytes)
      } else {
        const fileId = await this.o.provider.createFile(bytes)
        this.state.ownFileId = fileId
        await this.o.store.save(this.storeKey, this.state)
        this.o.onOwnFile?.(fileId)
      }
      this.state.written = written
      await this.o.store.save(this.storeKey, this.state)
      this.networkError = undefined
      this.lastSyncAt = this.now()
      this.retryDelay = 0
    } catch (error) {
      this.dirty = true
      if (!(error instanceof StorageError)) throw error
      if (error.kind === 'offline') this.networkError = 'offline'
      // Eigene Datei wurde gelöscht (z. B. im Drive von Hand): beim nächsten Mal neu anlegen.
      if (error.kind === 'not-found') delete this.state.ownFileId
      // Ohne Anmeldung wartet die Änderung, bis nach dem Login flush() aufgerufen wird.
      if (error.kind !== 'auth') this.scheduleRetry(error.retryAfterMs)
    }
  }

  private retryDelay = 0

  private scheduleRetry(requested?: number): void {
    this.retryDelay = Math.min(Math.max(this.retryDelay * 2, 5_000), 5 * 60_000)
    clearTimeout(this.timer)
    this.timer = setTimeout(
      () => {
        this.timer = undefined
        void this.flush()
      },
      Math.max(requested ?? 0, this.retryDelay),
    )
  }

  // --- Lesen ------------------------------------------------------------------

  /**
   * Fragt alle anderen Geräte einmal ab. Wirft nur bei Netzwerkproblemen
   * (`StorageError` offline/rate-limited/unavailable), damit der Aufrufer
   * mit wachsendem Abstand erneut versuchen kann.
   */
  poll(): Promise<void> {
    this.polling ??= this.pollOnce().finally(() => {
      this.polling = undefined
      this.emit()
    })
    return this.polling
  }

  private async pollOnce(): Promise<void> {
    if (!this.started) return
    const peers = this.o.peers().filter((p) => p.deviceId !== this.o.deviceId)
    const known = new Set(peers.map((p) => p.deviceId))
    for (const id of Object.keys(this.problems)) if (!known.has(id)) delete this.problems[id]

    let changed = false
    let networkError: StorageError | undefined
    for (const peer of peers) {
      try {
        changed = (await this.pollPeer(peer)) || changed
      } catch (error) {
        if (!(error instanceof StorageError)) throw error
        if (error.kind === 'not-found') {
          this.problems[peer.deviceId] = 'not-found'
        } else {
          networkError = error
          break
        }
      }
    }
    if (changed) await this.o.store.save(this.storeKey, this.state)
    if (networkError) {
      if (networkError.kind === 'offline') this.networkError = 'offline'
      throw networkError
    }
    this.networkError = undefined
    if (!this.dirty) this.lastSyncAt = this.now()
  }

  private async decrypt(envelope: Envelope, deviceId: string): Promise<Uint8Array> {
    const expected = { space: this.o.spaceId, doc: this.o.kind, device: deviceId }
    let lastError: unknown
    for (const key of [this.o.key, ...(this.o.previousKeys ?? [])]) {
      try {
        return await openEnvelope(key, envelope, expected)
      } catch (error) {
        // Nur ein falscher Schlüssel rechtfertigt den nächsten Versuch.
        if (!(error instanceof EnvelopeError) || error.reason !== 'decrypt') throw error
        lastError = error
      }
    }
    throw lastError
  }

  /** Liefert true, wenn sich der gespeicherte Peer-Zustand geändert hat. */
  private async pollPeer(peer: Peer): Promise<boolean> {
    const known = this.state.peers[peer.deviceId]
    const meta = await this.o.provider.readMeta(peer.fileId)
    if (known?.version === meta.version && this.problems[peer.deviceId] !== 'not-found') {
      return false
    }
    const bytes = await this.o.provider.readFile(peer.fileId)
    const record: PeerState = { seq: known?.seq ?? -1, version: meta.version }
    try {
      const envelope = decodeEnvelope(bytes)
      if (known && envelope.seq < known.seq) {
        this.problems[peer.deviceId] = 'rollback'
      } else {
        // Auch bei gleicher seq prüfen: Eine geänderte Datei mit alter seq ist verdächtig.
        const update = await this.decrypt(envelope, peer.deviceId)
        Y.applyUpdate(this.o.doc, update, REMOTE_ORIGIN)
        record.seq = envelope.seq
        delete this.problems[peer.deviceId]
      }
    } catch (error) {
      if (!(error instanceof EnvelopeError)) throw error
      // Untergeschobene, manipulierte oder kaputte Datei: ignorieren und melden.
      this.problems[peer.deviceId] = 'undecryptable'
    }
    this.state.peers[peer.deviceId] = record
    return true
  }
}
