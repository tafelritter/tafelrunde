// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Verwaltet Profil und Bereiche dieses Geräts und verbindet Datenmodell,
 * Verschlüsselung, lokale Ablage und Speicheranbieter
 * (plan/03-phase-1-einkaufsliste.md, 1.4–1.8).
 */

import * as Y from 'yjs'
import {
  type CatalogLookup,
  type GoogleConfig,
  type JoinReply,
  type Peer,
  type PersistedSyncState,
  type SpaceAccess,
  type SpaceKind,
  type StorageProvider,
  type SyncStateStore,
  DocSync,
  PollLoop,
  exportSpaceKey,
  generateSpaceKey,
  getMember,
  importSpaceKey,
  initSpace,
  deleteList,
  exportList,
  getLinkedSpaces,
  importList,
  linkSpace,
  listMembers,
  markRemoved,
  MAX_PHOTO_BYTES,
  addPhotoRef,
  listPhotos,
  openPhoto,
  removePhotoRef,
  sealPhoto,
  setPhotoFile,
  createRecipe,
  getRecipe,
  listRecipes,
  setSpaceOwner,
  spaceOwner,
  reportLinkedFile,
  peerFiles,
  randomId,
  setMemberFile,
  spaceName,
  upsertMember,
} from '@/core/base'
import type { KeyValueStore } from './kv'

export interface Profile {
  deviceId: string
  /** Person über alle eigenen Geräte (für Notizen und Bewertungen). */
  personId: string
  person: string
  deviceName: string
  createdAt: number
}

export interface SpaceRecord {
  id: string
  kind: SpaceKind
  key: CryptoKey
  /** Frühere Schlüssel nach einem Wechsel, nur zum Lesen (neueste zuerst). */
  previousKeys?: CryptoKey[]
  /** Dateien aus Einladung/Wiederherstellung, bis sie im Register stehen. */
  bootstrap: Peer[]
  createdAt: number
}

/** Hält ein Yjs-Dokument lokal fest (y-indexeddb); in Tests ein No-op. */
export type DocPersistence = (name: string, doc: Y.Doc) => Promise<{ destroy(): unknown }>

export interface WorkspaceDeps {
  kv: KeyValueStore
  provider: StorageProvider
  persistDoc: DocPersistence
  now?: () => number
  /** Abfrage-Intervalle (plan/01-architektur.md): 3 s in der Listenansicht, sonst 15 s. */
  intervals?: { active: number; idle: number }
  debounceMs?: number
  /** Google-Projekt dieses Geräts; reist in Einladung und Wiederherstellungscode mit. */
  googleConfig?: () => GoogleConfig | undefined
}

export interface DocHandle {
  readonly doc: Y.Doc
  readonly sync: DocSync
  readonly loop: PollLoop
}

export interface SpaceHandle extends DocHandle {
  readonly record: SpaceRecord
  /** Dokument `library` (Rezepte, Notizen, Bewertungen); fehlt bei geteilten Listen. */
  readonly library: DocHandle | undefined
}

/** Abfrage-Intervall für `library` (plan/01-architektur.md): 30 s, sofort beim Öffnen. */
const LIBRARY_INTERVAL_MS = 30_000

const K = {
  profile: 'profile',
  space: (id: string) => `space/${id}`,
  sync: (key: string) => `sync/${key}`,
  photo: (id: string) => `photo/${id}`,
}

/** `live` und, falls vorhanden, `library` eines Bereichs. */
function docHandles(handle: SpaceHandle): DocHandle[] {
  return handle.library ? [handle, handle.library] : [handle]
}

/** Höchstens drei alte Schlüssel behalten – genug für Geräte, die noch nicht gewechselt haben. */
function keepKeys(record: SpaceRecord): CryptoKey[] {
  return [record.key, ...(record.previousKeys ?? [])].slice(0, 3)
}

class KvSyncStateStore implements SyncStateStore {
  constructor(private readonly kv: KeyValueStore) {}
  load(key: string) {
    return this.kv.get<PersistedSyncState>(K.sync(key))
  }
  save(key: string, state: PersistedSyncState) {
    return this.kv.set(K.sync(key), state)
  }
}

export class Workspace {
  private profileValue: Profile | undefined
  private records = new Map<string, SpaceRecord>()
  private readonly handles = new Map<string, Promise<SpaceHandle>>()
  private readonly persistence = new Map<string, { destroy(): unknown }[]>()
  private readonly syncStore: SyncStateStore
  private readonly now: () => number
  private visible = true

  private constructor(private readonly deps: WorkspaceDeps) {
    this.syncStore = new KvSyncStateStore(deps.kv)
    this.now = deps.now ?? Date.now
  }

  static async open(deps: WorkspaceDeps): Promise<Workspace> {
    const ws = new Workspace(deps)
    ws.profileValue = await deps.kv.get<Profile>(K.profile)
    if (ws.profileValue && !ws.profileValue.personId) {
      // Profile aus Phase 1 bekommen nachträglich eine Personen-ID.
      ws.profileValue = { ...ws.profileValue, personId: randomId() }
      await deps.kv.set(K.profile, ws.profileValue)
    }
    for (const key of await deps.kv.keys('space/')) {
      const record = await deps.kv.get<SpaceRecord>(key)
      if (record) ws.records.set(record.id, record)
    }
    return ws
  }

  get profile(): Profile | undefined {
    return this.profileValue
  }

  get provider(): StorageProvider {
    return this.deps.provider
  }

  /** Erster Start: Profil anlegen und den persönlichen Bereich erzeugen. */
  async setup(person: string, deviceName: string): Promise<Profile> {
    if (this.profileValue) throw new Error('Profil existiert bereits')
    const profile: Profile = {
      deviceId: randomId(),
      personId: randomId(),
      person: person.trim(),
      deviceName: deviceName.trim(),
      createdAt: this.now(),
    }
    if (!profile.person) throw new Error('Name fehlt')
    await this.deps.kv.set(K.profile, profile)
    this.profileValue = profile
    await this.createSpace('Persönlich', 'personal')
    return profile
  }

  async updateProfile(
    patch: Partial<Pick<Profile, 'person' | 'deviceName' | 'personId'>>,
  ): Promise<void> {
    const profile = this.requireProfile()
    const next = { ...profile, ...patch }
    await this.deps.kv.set(K.profile, next)
    this.profileValue = next
    for (const id of this.records.keys()) {
      const handle = await this.space(id)
      this.registerSelf(handle.doc)
    }
  }

  private requireProfile(): Profile {
    if (!this.profileValue) throw new Error('Einrichtung fehlt')
    return this.profileValue
  }

  spaces(): SpaceRecord[] {
    return [...this.records.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  personalSpace(): SpaceRecord | undefined {
    return this.spaces().find((s) => s.kind === 'personal')
  }

  hasSpace(id: string): boolean {
    return this.records.has(id)
  }

  async createSpace(name: string, kind: SpaceKind): Promise<SpaceHandle> {
    this.requireProfile()
    const record: SpaceRecord = {
      id: randomId(),
      kind,
      key: await generateSpaceKey(),
      bootstrap: [],
      createdAt: this.now(),
    }
    await this.saveRecord(record)
    const handle = await this.space(record.id)
    initSpace(handle.doc, name.trim() || 'Ohne Namen', kind)
    if (kind === 'personal') setSpaceOwner(handle.doc, this.requireProfile().personId)
    this.registerSelf(handle.doc)
    return handle
  }

  private async saveRecord(record: SpaceRecord): Promise<void> {
    await this.deps.kv.set(K.space(record.id), record)
    this.records.set(record.id, record)
  }

  private registerSelf(doc: Y.Doc): void {
    const profile = this.requireProfile()
    const existing = getMember(doc, profile.deviceId)
    upsertMember(doc, {
      deviceId: profile.deviceId,
      personId: profile.personId,
      person: profile.person,
      deviceName: profile.deviceName,
      provider: this.deps.provider.id,
      joinedAt: existing?.joinedAt ?? this.now(),
    })
  }

  /** Öffnet einen Bereich (einmal je Sitzung) samt lokaler Ablage, Sync und Abfrage. */
  space(id: string): Promise<SpaceHandle> {
    let handle = this.handles.get(id)
    if (!handle) {
      handle = this.openSpace(id)
      this.handles.set(id, handle)
      handle.catch(() => this.handles.delete(id))
    }
    return handle
  }

  private async openSpace(id: string): Promise<SpaceHandle> {
    const record = this.records.get(id)
    if (!record) throw new Error('unbekannter Bereich')
    const profile = this.requireProfile()
    const doc = new Y.Doc()
    const persisted = [await this.deps.persistDoc(`tafelrunde/${id}/live`, doc)]
    this.persistence.set(id, persisted)

    const sync = new DocSync({
      doc,
      kind: 'live',
      spaceId: id,
      key: record.key,
      previousKeys: record.previousKeys ?? [],
      deviceId: profile.deviceId,
      provider: this.deps.provider,
      store: this.syncStore,
      ...(this.deps.debounceMs !== undefined ? { debounceMs: this.deps.debounceMs } : {}),
      now: this.now,
      peers: () => this.peersOf(id, doc),
      onOwnFile: (fileId) => {
        // Auch den Anbieter aktualisieren (z. B. erst lokal, dann mit Google verbunden).
        this.registerSelf(doc)
        setMemberFile(doc, profile.deviceId, 'live', fileId)
        // Eigene Datei in verknüpften Bereichen dem Haushalt melden.
        if (record.kind === 'shared-list') this.scheduleLinkSync()
      },
    })
    await sync.start()
    const intervals = this.deps.intervals ?? { active: 3000, idle: 15_000 }
    const loop = new PollLoop({
      poll: () => sync.poll(),
      intervalMs: intervals.idle,
      onUnexpectedError: (error) => console.error('Sync-Fehler', error),
    })
    loop.setVisible(this.visible)
    // Haushalt: verknüpfte Bereiche (geteilte Listen) automatisch übernehmen.
    if (record.kind !== 'shared-list') doc.on('update', () => this.scheduleLinkSync())

    let library: DocHandle | undefined
    if (record.kind !== 'shared-list') {
      const libDoc = new Y.Doc()
      persisted.push(await this.deps.persistDoc(`tafelrunde/${id}/library`, libDoc))
      const libSync = new DocSync({
        doc: libDoc,
        kind: 'library',
        spaceId: id,
        key: record.key,
        previousKeys: record.previousKeys ?? [],
        deviceId: profile.deviceId,
        provider: this.deps.provider,
        store: this.syncStore,
        ...(this.deps.debounceMs !== undefined ? { debounceMs: this.deps.debounceMs } : {}),
        now: this.now,
        // Die Dateien für `library` stehen im Register des Dokuments `live`.
        peers: () => peerFiles(doc, 'library', profile.deviceId),
        onOwnFile: (fileId) => {
          this.registerSelf(doc)
          setMemberFile(doc, profile.deviceId, 'library', fileId)
        },
      })
      await libSync.start()
      const libLoop = new PollLoop({
        poll: () => libSync.poll(),
        intervalMs: LIBRARY_INTERVAL_MS,
        onUnexpectedError: (error) => console.error('Sync-Fehler', error),
      })
      libLoop.setVisible(this.visible)
      library = { doc: libDoc, sync: libSync, loop: libLoop }
    }

    const records = this.records
    return {
      // Immer der aktuelle Datensatz (Schlüssel ändern sich beim Schlüsselwechsel).
      get record() {
        return records.get(id) ?? record
      },
      doc,
      sync,
      loop,
      library,
    }
  }

  private peersOf(id: string, doc: Y.Doc): Peer[] {
    const self = this.profileValue?.deviceId ?? ''
    const known = peerFiles(doc, 'live', self)
    const record = this.records.get(id)
    const removed = new Set(
      listMembers(doc, { includeRemoved: true })
        .filter((m) => m.removedAt !== undefined)
        .map((m) => m.deviceId),
    )
    const extra = (record?.bootstrap ?? []).filter(
      (b) =>
        b.deviceId !== self &&
        !removed.has(b.deviceId) &&
        !known.some((k) => k.deviceId === b.deviceId),
    )
    return [...known, ...extra]
  }

  /** Abfragen nur, solange die App sichtbar ist (Page Visibility). */
  async setVisible(visible: boolean): Promise<void> {
    this.visible = visible
    for (const handle of this.handles.values()) {
      for (const h of docHandles(await handle)) h.loop.setVisible(visible)
    }
  }

  /** Startet Sync für alle Bereiche; `activeSpaceId` wird schneller abgefragt. */
  async startSync(activeSpaceId?: string): Promise<void> {
    const intervals = this.deps.intervals ?? { active: 3000, idle: 15_000 }
    for (const record of this.spaces()) {
      const handle = await this.space(record.id)
      handle.loop.setInterval(record.id === activeSpaceId ? intervals.active : intervals.idle)
      handle.loop.start()
      handle.library?.loop.start()
    }
  }

  /** Nach dem Login: ausstehende Änderungen aller Bereiche schreiben. */
  async flushAll(): Promise<void> {
    for (const record of this.spaces()) {
      for (const h of docHandles(await this.space(record.id))) await h.sync.flush()
    }
    await this.uploadPendingPhotos().catch((e: unknown) => console.error('Foto-Upload', e))
  }

  get hasPendingChanges(): Promise<boolean> {
    return Promise.all([...this.handles.values()]).then((hs) =>
      hs.some((h) => docHandles(h).some((d) => d.sync.hasPendingChanges)),
    )
  }

  // --- Einladen, Beitreten, Wiederherstellen ------------------------------------

  private async accessFor(id: string, type: SpaceAccess['type']): Promise<SpaceAccess> {
    const handle = await this.space(id)
    const self = this.requireProfile().deviceId
    const peers = listMembers(handle.doc)
      .filter((m) => m.files.live)
      .map((m) => ({ deviceId: m.deviceId, provider: m.provider, files: m.files }))
    // Bei der Einladung genügt das eigene Gerät; der Rest steht im Register.
    const selected = type === 'invite' ? peers.filter((p) => p.deviceId === self) : peers
    const access: SpaceAccess = {
      type,
      spaceId: id,
      key: await exportSpaceKey(handle.record.key),
      name: spaceName(handle.doc),
      kind: handle.record.kind,
      peers: selected.length > 0 ? selected : peers.slice(0, 1),
    }
    const google = this.deps.googleConfig?.()
    if (google) access.google = google
    return access
  }

  /**
   * Einladung für einen Bereich. Setzt voraus, dass dieses Gerät schon eine
   * eigene Datei geschrieben hat (sonst kann das neue Gerät nichts lesen).
   */
  async invite(id: string): Promise<SpaceAccess> {
    const access = await this.accessFor(id, 'invite')
    if (access.peers.length === 0)
      throw new Error('Noch nicht synchronisiert – bitte zuerst mit dem Speicher verbinden.')
    return access
  }

  async recoveryCode(id: string): Promise<SpaceAccess> {
    return this.accessFor(id, 'recovery')
  }

  /** Tritt einem Bereich bei (Einladung) oder stellt ihn wieder her. */
  async join(access: SpaceAccess): Promise<SpaceHandle> {
    this.requireProfile()
    const bootstrap: Peer[] = access.peers.flatMap((p) =>
      p.files.live ? [{ deviceId: p.deviceId, fileId: p.files.live }] : [],
    )
    const existing = this.records.get(access.spaceId)
    if (existing) {
      // Erneut beigetreten (z. B. nach Schlüsselwechsel): neuen Schlüssel übernehmen,
      // den alten nur noch zum Lesen behalten.
      const key = await importSpaceKey(access.key)
      const same = (await exportSpaceKey(existing.key)) === access.key
      const updated: SpaceRecord = {
        ...existing,
        key,
        previousKeys: same ? (existing.previousKeys ?? []) : keepKeys(existing),
        bootstrap,
      }
      await this.saveRecord(updated)
      const open = this.handles.get(access.spaceId)
      if (open) {
        for (const h of docHandles(await open))
          h.sync.setKeys(updated.key, updated.previousKeys ?? [])
      }
    } else {
      await this.saveRecord({
        id: access.spaceId,
        kind: access.kind,
        key: await importSpaceKey(access.key),
        bootstrap,
        createdAt: this.now(),
      })
    }
    const handle = await this.space(access.spaceId)
    await handle.sync.poll().catch(() => undefined)
    this.registerSelf(handle.doc)
    // Eigenes weiteres Gerät: dieselbe Person wie auf dem ersten Gerät.
    const owner = access.kind === 'personal' ? spaceOwner(handle.doc) : undefined
    if (owner && owner !== this.requireProfile().personId)
      await this.updateProfile({ personId: owner })
    return handle
  }

  /** Antwort-Code für das einladende Gerät; erst sinnvoll, wenn die eigene Datei existiert. */
  async reply(id: string): Promise<JoinReply> {
    const handle = await this.space(id)
    await handle.sync.flush()
    const profile = this.requireProfile()
    const fileId = handle.sync.ownFileId
    if (!fileId)
      throw new Error('Noch nicht synchronisiert – bitte zuerst mit dem Speicher verbinden.')
    return {
      type: 'reply',
      spaceId: id,
      deviceId: profile.deviceId,
      person: profile.person,
      deviceName: profile.deviceName,
      provider: this.deps.provider.id,
      files: { live: fileId },
    }
  }

  /** Nimmt ein neues Gerät nach dessen Antwort-Code ins Register auf. */
  async acceptReply(reply: JoinReply): Promise<SpaceHandle> {
    const handle = await this.space(reply.spaceId)
    const existing = getMember(handle.doc, reply.deviceId)
    if (existing?.removedAt !== undefined) throw new Error('Dieses Gerät wurde entfernt.')
    upsertMember(handle.doc, {
      deviceId: reply.deviceId,
      person: reply.person,
      deviceName: reply.deviceName,
      provider: reply.provider,
      joinedAt: existing?.joinedAt ?? this.now(),
      files: reply.files,
    })
    await handle.sync.poll().catch(() => undefined)
    return handle
  }

  // --- Geteilte Listen (verknüpfte Bereiche) ------------------------------------

  /**
   * Überführt eine Liste in einen eigenen Bereich, den man mit Externen teilen
   * kann. Alle Geräte des bisherigen Bereichs treten automatisch bei.
   */
  async shareList(
    fromSpaceId: string,
    listId: string,
    lookup?: CatalogLookup,
  ): Promise<SpaceHandle> {
    const from = await this.space(fromSpaceId)
    const data = exportList(from.doc, listId, lookup)
    const target = await this.createSpace(data.name, 'shared-list')
    importList(target.doc, data, this.now())
    from.doc.transact(() => {
      deleteList(from.doc, listId)
    })
    linkSpace(from.doc, {
      spaceId: target.record.id,
      name: data.name,
      key: await exportSpaceKey(target.record.key),
    })
    await this.syncLinks()
    return target
  }

  private linkTimer: ReturnType<typeof setTimeout> | undefined
  private linkRun: Promise<void> | undefined

  private scheduleLinkSync(): void {
    clearTimeout(this.linkTimer)
    this.linkTimer = setTimeout(
      () => void this.syncLinks().catch((e: unknown) => console.error(e)),
      300,
    )
  }

  /** Tritt verknüpften Bereichen bei und gleicht die gemeldeten Dateien ab. */
  syncLinks(): Promise<void> {
    const run = async () => {
      const self = this.requireProfile().deviceId
      for (const record of this.spaces()) {
        if (record.kind === 'shared-list') continue
        const household = await this.space(record.id)
        for (const link of getLinkedSpaces(household.doc)) {
          if (!this.records.has(link.spaceId)) {
            await this.join({
              type: 'invite',
              spaceId: link.spaceId,
              key: link.key,
              name: link.name,
              kind: 'shared-list',
              peers: Object.entries(link.files)
                .filter(([deviceId]) => deviceId !== self)
                .map(([deviceId, fileId]) => ({ deviceId, provider: '', files: { live: fileId } })),
            })
            this.onSpacesChanged?.()
          }
          const shared = await this.space(link.spaceId)
          const own = shared.sync.ownFileId
          if (own) reportLinkedFile(household.doc, link.spaceId, self, own)
          for (const [deviceId, fileId] of Object.entries(link.files)) {
            if (deviceId === self) continue
            const member = getMember(shared.doc, deviceId)
            if (member?.removedAt !== undefined || member?.files.live === fileId) continue
            const info = getMember(household.doc, deviceId)
            upsertMember(shared.doc, {
              deviceId,
              person: info?.person ?? '',
              deviceName: info?.deviceName ?? '',
              provider: info?.provider ?? '',
              joinedAt: member?.joinedAt ?? this.now(),
              files: { live: fileId },
            })
          }
        }
      }
    }
    // Nie zwei Abgleiche gleichzeitig; ein angeforderter läuft nach dem aktuellen.
    const next = (this.linkRun ?? Promise.resolve()).then(run, run)
    this.linkRun = next.finally(() => {
      if (this.linkRun === next) this.linkRun = undefined
    })
    return next
  }

  // --- Rezepte teilen (2.12) und übernehmen (2.11) ------------------------------

  /**
   * Rezept-Freigabe: eigener Bereich mit einer Kopie des Rezepts und aller
   * Unterrezepte aus demselben Bereich. Empfänger lesen ohne Konto und
   * können das Rezept übernehmen; nur der Ersteller schreibt.
   */
  async shareRecipe(fromSpaceId: string, recipeId: string): Promise<SpaceHandle> {
    const from = await this.space(fromSpaceId)
    if (!from.library) throw new Error('Dieser Bereich hat keine Rezepte.')
    const all = listRecipes(from.library.doc)
    const start = all.find((r) => r.id === recipeId)
    if (!start) throw new Error('Rezept nicht gefunden.')
    // Parser erst hier laden: gehört nicht in den Start-Chunk.
    const { parseRecipe, resolveReference } = await import('@/core')
    const entries = all.map((r) => ({
      key: r.id,
      scope: fromSpaceId,
      recipe: parseRecipe(r.source),
    }))
    const index = { entries }
    // Unterrezepte aus demselben Bereich mitnehmen (Katalogrezepte sind ohnehin öffentlich).
    const include = new Set<string>([recipeId])
    const queue = [recipeId]
    while (queue.length) {
      const id = queue.shift()!
      const entry = entries.find((e) => e.key === id)
      for (const ingredient of entry?.recipe.ingredients ?? []) {
        if (!ingredient.reference) continue
        const target = resolveReference(index, ingredient.reference, fromSpaceId)
        if (target && target.scope === fromSpaceId && !include.has(target.key)) {
          include.add(target.key)
          queue.push(target.key)
        }
      }
    }
    const title = entries.find((e) => e.key === recipeId)?.recipe.meta.title || 'Rezept'
    const share = await this.createSpace(title, 'recipe-share')
    setSpaceOwner(share.doc, this.requireProfile().personId)
    for (const r of all.filter((x) => include.has(x.id))) {
      createRecipe(share.library!.doc, r.source, this.requireProfile().personId, this.now(), {
        kind: 'shared',
        ref: `${fromSpaceId}/${r.id}`,
        version: String(r.updatedAt),
      })
    }
    return share
  }

  /** Kopie eines Rezepts (z. B. aus einer Freigabe) in einen eigenen Bereich. */
  async adoptRecipe(fromSpaceId: string, recipeId: string, toSpaceId: string): Promise<string> {
    const from = await this.space(fromSpaceId)
    const to = await this.space(toSpaceId)
    const recipe = from.library && getRecipe(from.library.doc, recipeId)
    if (!recipe || !to.library) throw new Error('Rezept nicht gefunden.')
    return createRecipe(to.library.doc, recipe.source, this.requireProfile().personId, this.now(), {
      kind: 'shared',
      ref: `${fromSpaceId}/${recipeId}`,
      version: String(recipe.updatedAt),
    })
  }

  // --- Fotos (2.9) ------------------------------------------------------------------

  /**
   * Fügt ein (bereits verkleinertes) Foto hinzu. Es liegt sofort lokal vor
   * und wird hochgeladen, sobald ein Speicher verbunden ist.
   */
  async addPhoto(
    spaceId: string,
    recipeId: string,
    bytes: Uint8Array,
    size: { width: number; height: number },
  ): Promise<string> {
    const handle = await this.space(spaceId)
    if (!handle.library) throw new Error('Dieser Bereich hat keine Rezepte.')
    if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Foto ist zu groß.')
    const id = randomId()
    await this.deps.kv.set(K.photo(id), bytes)
    addPhotoRef(handle.library.doc, {
      id,
      recipeId,
      ...size,
      addedBy: this.requireProfile().personId,
      addedAt: this.now(),
    })
    await this.uploadPendingPhotos().catch(() => undefined)
    return id
  }

  /** Lädt noch nicht hochgeladene Fotos dieses Geräts hoch. */
  async uploadPendingPhotos(): Promise<void> {
    if (!this.deps.provider.canWrite()) return
    for (const record of this.spaces()) {
      const handle = await this.space(record.id)
      if (!handle.library) continue
      for (const ref of listPhotos(handle.library.doc)) {
        if (ref.fileId) continue
        const bytes = await this.deps.kv.get<Uint8Array>(K.photo(ref.id))
        if (!bytes) continue // liegt auf einem anderen Gerät
        const file = await sealPhoto(handle.record.key, record.id, ref.id, bytes)
        setPhotoFile(handle.library.doc, ref.id, await this.deps.provider.createFile(file))
      }
    }
  }

  /** Foto-Inhalt: aus dem lokalen Speicher oder über den Lese-Link (dann zwischengespeichert). */
  async loadPhoto(spaceId: string, photoId: string): Promise<Uint8Array | undefined> {
    const cached = await this.deps.kv.get<Uint8Array>(K.photo(photoId))
    if (cached) return cached
    const handle = await this.space(spaceId)
    const ref = handle.library && listPhotos(handle.library.doc).find((p) => p.id === photoId)
    if (!ref?.fileId) return undefined
    const file = await this.deps.provider.readFile(ref.fileId)
    const record = handle.record
    const bytes = await openPhoto(
      [record.key, ...(record.previousKeys ?? [])],
      spaceId,
      photoId,
      file,
    )
    await this.deps.kv.set(K.photo(photoId), bytes)
    return bytes
  }

  async removePhoto(spaceId: string, photoId: string): Promise<void> {
    const handle = await this.space(spaceId)
    if (handle.library) removePhotoRef(handle.library.doc, photoId)
    await this.deps.kv.delete(K.photo(photoId))
  }

  /** Wird aufgerufen, wenn Bereiche ohne Zutun der Oberfläche hinzukommen. */
  onSpacesChanged: (() => void) | undefined

  /**
   * Entfernt ein Gerät und wechselt den Schlüssel (plan/01-architektur.md,
   * „Entfernen und Schlüsselwechsel“). Ab sofort wird mit dem neuen
   * Schlüssel geschrieben; die verbleibenden Geräte übernehmen ihn über
   * `invite()` (Schlüssel-Code). Was das entfernte Gerät schon gesehen hat,
   * bleibt ihm bekannt.
   */
  async removeDevice(spaceId: string, deviceId: string): Promise<SpaceHandle> {
    const profile = this.requireProfile()
    if (deviceId === profile.deviceId)
      throw new Error('Dieses Gerät kann sich nicht selbst entfernen.')
    const before = await this.space(spaceId)
    markRemoved(before.doc, deviceId, this.now())
    const record = this.records.get(spaceId)!
    const updated: SpaceRecord = {
      ...record,
      key: await generateSpaceKey(),
      previousKeys: keepKeys(record),
      bootstrap: record.bootstrap.filter((b) => b.deviceId !== deviceId),
    }
    await this.saveRecord(updated)
    for (const h of docHandles(before)) {
      h.sync.setKeys(updated.key, updated.previousKeys ?? [])
      await h.sync.flush()
    }
    return before
  }

  private async closeSpace(id: string): Promise<void> {
    const handle = this.handles.get(id)
    if (!handle) return
    this.handles.delete(id)
    const h = await handle
    for (const d of docHandles(h)) {
      d.loop.stop()
      d.sync.stop()
    }
    for (const p of this.persistence.get(id) ?? []) p.destroy()
    this.persistence.delete(id)
    for (const d of docHandles(h)) d.doc.destroy()
  }

  async close(): Promise<void> {
    for (const id of [...this.handles.keys()]) await this.closeSpace(id)
  }
}
