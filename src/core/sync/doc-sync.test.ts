// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { encodeEnvelope, generateSpaceKey, sealEnvelope } from '../crypto/envelope'
import { randomId } from '../crypto/ids'
import { addItem, createList, getItems, getLists, setChecked, updateItem } from '../model/shopping'
import {
  LIVE_ROOT,
  getMember,
  initSpace,
  listMembers,
  peerFiles,
  setMemberFile,
  upsertMember,
} from '../model/space'
import { DocSync, MemorySyncStateStore, type Peer } from './doc-sync'
import { FakeCloud, FakeProvider } from './fake-provider'

interface Device {
  id: string
  doc: Y.Doc
  provider: FakeProvider
  store: MemorySyncStateStore
  sync: DocSync
  /** Dateien aus Einladung oder Antwort-Code, bevor sie im Register stehen. */
  bootstrap: Peer[]
}

let cloud: FakeCloud
let spaceId: string
let key: CryptoKey

beforeEach(async () => {
  cloud = new FakeCloud()
  spaceId = randomId()
  key = await generateSpaceKey()
})

const devices: Device[] = []
afterEach(() => {
  for (const d of devices.splice(0)) d.sync.stop()
})

async function device(person: string, bootstrap: Peer[] = []): Promise<Device> {
  const id = randomId()
  const doc = new Y.Doc()
  const provider = new FakeProvider(cloud, person)
  const store = new MemorySyncStateStore()
  const d: Device = { id, doc, provider, store, bootstrap, sync: undefined as unknown as DocSync }
  d.sync = new DocSync({
    doc,
    kind: 'live',
    spaceId,
    key,
    deviceId: id,
    provider,
    store,
    debounceMs: 50,
    peers: () => {
      const known = peerFiles(doc, 'live', id)
      const extra = d.bootstrap.filter((b) => !known.some((k) => k.deviceId === b.deviceId))
      return [...known, ...extra]
    },
    onOwnFile: (fileId) => {
      if (getMember(doc, id)) setMemberFile(doc, id, 'live', fileId)
    },
  })
  await d.sync.start()
  devices.push(d)
  return d
}

function join(d: Device, person: string): void {
  upsertMember(d.doc, {
    deviceId: d.id,
    person,
    deviceName: `${person}s Gerät`,
    provider: 'fake',
    joinedAt: Date.now(),
  })
}

/** Schreibt so lange, bis nichts mehr aussteht (die eigene Datei-ID im Register erzeugt eine Änderung). */
async function settle(...ds: Device[]): Promise<void> {
  for (let round = 0; round < 5; round++) {
    for (const d of ds) await d.sync.flush()
    for (const d of ds) await d.sync.poll().catch(() => undefined)
  }
  for (const d of ds) await d.sync.flush()
}

/** Haushalt mit drei Geräten wie nach Einladung und Antwort-Code. */
async function household(): Promise<[Device, Device, Device]> {
  const a = await device('Anna')
  initSpace(a.doc, 'Familie', 'household')
  join(a, 'Anna')
  await settle(a)
  const aFile = a.sync.ownFileId!

  const b = await device('Ben', [{ deviceId: a.id, fileId: aFile }])
  await b.sync.poll()
  join(b, 'Ben')
  await settle(b)
  // Antwort-Code: A trägt B ins Register ein.
  upsertMember(a.doc, {
    deviceId: b.id,
    person: 'Ben',
    deviceName: 'Bens Gerät',
    provider: 'fake',
    joinedAt: Date.now(),
    files: { live: b.sync.ownFileId! },
  })

  const c = await device('Cleo', [{ deviceId: a.id, fileId: aFile }])
  await c.sync.poll()
  join(c, 'Cleo')
  await settle(c)
  upsertMember(a.doc, {
    deviceId: c.id,
    person: 'Cleo',
    deviceName: 'Cleos Gerät',
    provider: 'fake',
    joinedAt: Date.now(),
    files: { live: c.sync.ownFileId! },
  })
  await settle(a, b, c)
  return [a, b, c]
}

const state = (d: Device) => Y.encodeStateAsUpdate(d.doc)
function converged(...ds: Device[]) {
  const view = (d: Device) =>
    Object.fromEntries(Object.values(LIVE_ROOT).map((r) => [r, d.doc.getMap(r).toJSON()]))
  const [first, ...rest] = ds.map(view)
  for (const other of rest) expect(other).toEqual(first)
  for (const d of ds.slice(1)) {
    expect(Y.encodeStateVector(d.doc)).toEqual(Y.encodeStateVector(ds[0]!.doc))
  }
}

describe('DocSync', () => {
  it('schreibt verschlüsselt und ohne Klartext in die Cloud', async () => {
    const a = await device('Anna')
    initSpace(a.doc, 'Familie Geheim', 'household')
    join(a, 'Anna')
    await settle(a)
    expect(cloud.files.size).toBe(1)
    const [file] = [...cloud.files.values()]
    const text = new TextDecoder().decode(file!.content)
    expect(text).not.toContain('Geheim')
    expect(text).not.toContain('Anna')
    expect(JSON.parse(text)).toMatchObject({ v: 1, space: spaceId, doc: 'live', device: a.id })
  })

  it('verbindet drei Geräte über Einladung und Register', async () => {
    const [a, b, c] = await household()
    converged(a, b, c)
    expect(listMembers(c.doc).map((m) => m.person)).toEqual(['Anna', 'Ben', 'Cleo'])
    for (const d of [a, b, c]) expect(d.sync.snapshot().status).toBe('synced')
  })

  it('verteilt Änderungen an alle Geräte', async () => {
    const [a, b, c] = await household()
    const listId = createList(b.doc, 'Wocheneinkauf')
    addItem(b.doc, listId, { name: 'Milch', quantity: '2', unit: 'l' }, b.id)
    await settle(a, b, c)
    converged(a, b, c)
    expect(getItems(c.doc, listId).map((i) => i.name)).toEqual(['Milch'])
  })

  it('führt gleichzeitige Offline-Änderungen ohne Verlust zusammen', async () => {
    const [a, b, c] = await household()
    const listId = createList(a.doc, 'Liste')
    const milk = addItem(a.doc, listId, { name: 'Milch' }, a.id)
    await settle(a, b, c)

    a.provider.offline = true
    b.provider.offline = true
    // Beide ändern denselben Eintrag an verschiedenen Feldern und fügen etwas hinzu.
    setChecked(a.doc, milk, true)
    updateItem(b.doc, milk, { quantity: '3' })
    addItem(a.doc, listId, { name: 'Brot' }, a.id)
    addItem(b.doc, listId, { name: 'Eier' }, b.id)
    await a.sync.flush()
    await b.sync.flush()
    expect(a.sync.snapshot().status).toBe('offline')
    expect(a.sync.hasPendingChanges).toBe(true)

    a.provider.offline = false
    b.provider.offline = false
    await settle(a, b, c)
    converged(a, b, c)
    const items = getItems(c.doc, listId)
    expect(items.map((i) => i.name).sort()).toEqual(['Brot', 'Eier', 'Milch'])
    expect(items.find((i) => i.id === milk)).toMatchObject({ checked: true, quantity: '3' })
  })

  it('reicht Änderungen über Dritte weiter (jede Datei enthält den vollen Stand)', async () => {
    const [a, b, c] = await household()
    // C sieht A nicht direkt, nur B.
    const aFile = a.sync.ownFileId!
    const original = c.sync['o'].peers
    c.sync['o'].peers = () => original().filter((p) => p.fileId !== aFile)
    createList(a.doc, 'Nur von A')
    await settle(a, b)
    await c.sync.poll()
    expect(getLists(c.doc).map((l) => l.name)).toEqual(['Nur von A'])
  })

  it('verwirft zurückgespielte alte Stände (Rollback)', async () => {
    const [a, b] = await household()
    const aFile = a.sync.ownFileId!
    const old = cloud.files.get(aFile)!.content.slice()
    const listId = createList(a.doc, 'Neu')
    await settle(a, b)
    expect(getLists(b.doc)).toHaveLength(1)

    // Angreifer mit Zugriff auf A's Drive spielt die alte Datei zurück.
    cloud.tamper(aFile, old)
    const before = state(b)
    await b.sync.poll()
    expect(state(b)).toEqual(before)
    expect(b.sync.snapshot().problems[a.id]).toBe('rollback')
    expect(b.sync.snapshot().status).toBe('member-unreachable')

    // Sobald A wieder schreibt, ist alles in Ordnung.
    addItem(a.doc, listId, { name: 'Tee' }, a.id)
    await settle(a, b)
    expect(b.sync.snapshot().problems).toEqual({})
    expect(getItems(b.doc, listId)).toHaveLength(1)
  })

  it('ignoriert untergeschobene und manipulierte Dateien', async () => {
    const [a, b] = await household()
    const aFile = a.sync.ownFileId!

    // Datei mit fremdem Schlüssel, aber korrektem Kopf
    const evil = new Y.Doc()
    createList(evil, 'Phishing')
    const otherKey = await generateSpaceKey()
    const forged = await sealEnvelope(
      otherKey,
      { space: spaceId, doc: 'live', device: a.id, seq: 10_000 },
      Y.encodeStateAsUpdate(evil),
    )
    cloud.tamper(aFile, encodeEnvelope(forged))
    await b.sync.poll()
    expect(getLists(b.doc).map((l) => l.name)).not.toContain('Phishing')
    expect(b.sync.snapshot().problems[a.id]).toBe('undecryptable')

    // Kein JSON
    cloud.tamper(aFile, new TextEncoder().encode('<html>'))
    await b.sync.poll()
    expect(b.sync.snapshot().problems[a.id]).toBe('undecryptable')

    // Echte Datei eines anderen Geräts unter A's ID (vertauscht)
    const bFile = b.sync.ownFileId!
    cloud.tamper(aFile, cloud.files.get(bFile)!.content)
    await b.sync.poll()
    expect(b.sync.snapshot().problems[a.id]).toBe('undecryptable')
  })

  it('meldet fehlende Dateien und erholt sich', async () => {
    const [a, b] = await household()
    const aFile = a.sync.ownFileId!
    const saved = cloud.files.get(aFile)!
    cloud.files.delete(aFile)
    await b.sync.poll()
    expect(b.sync.snapshot()).toMatchObject({
      status: 'member-unreachable',
      problems: { [a.id]: 'not-found' },
    })
    cloud.files.set(aFile, saved)
    await b.sync.poll()
    expect(b.sync.snapshot().status).toBe('synced')
  })

  it('legt die eigene Datei neu an, wenn sie gelöscht wurde', async () => {
    const [a] = await household()
    const old = a.sync.ownFileId!
    cloud.files.delete(old)
    createList(a.doc, 'Nach Löschung')
    await a.sync.flush()
    expect(a.sync.ownFileId).toBeUndefined()
    await a.sync.flush()
    expect(a.sync.ownFileId).toBeDefined()
    expect(a.sync.ownFileId).not.toBe(old)
  })

  it('lädt unveränderte Dateien nicht erneut', async () => {
    const [a, b, c] = await household()
    void a
    void c
    const reads = cloud.calls.read
    await b.sync.poll()
    await b.sync.poll()
    expect(cloud.calls.read).toBe(reads)
  })

  it('wartet ohne Anmeldung und schreibt nach dem Login', async () => {
    const [a, b] = await household()
    a.provider.loggedIn = false
    createList(a.doc, 'Später')
    await a.sync.flush()
    expect(a.sync.snapshot().status).toBe('login-required')
    a.provider.loggedIn = true
    await a.sync.flush()
    await b.sync.poll()
    expect(getLists(b.doc).map((l) => l.name)).toEqual(['Später'])
  })

  it('hält seq über Neustarts monoton', async () => {
    const a = await device('Anna')
    initSpace(a.doc, 'X', 'personal')
    await settle(a)
    const seqBefore = a.store.data.get(`${spaceId}/live`)!.seq
    a.sync.stop()
    const again = new DocSync({
      doc: a.doc,
      kind: 'live',
      spaceId,
      key,
      deviceId: a.id,
      provider: a.provider,
      store: a.store,
      peers: () => [],
    })
    await again.start()
    createList(a.doc, 'Y')
    await again.flush()
    again.stop()
    expect(a.store.data.get(`${spaceId}/live`)!.seq).toBe(seqBefore + 1)
    expect(again.ownFileId).toBe(a.sync.ownFileId)
  })

  it('entprellt Schreibvorgänge', async () => {
    vi.useFakeTimers()
    try {
      const a = await device('Anna')
      initSpace(a.doc, 'X', 'personal')
      for (let i = 0; i < 10; i++) createList(a.doc, `Liste ${i}`)
      expect(cloud.calls.create).toBe(0)
      await vi.advanceTimersByTimeAsync(60)
      await a.sync.idle()
      expect(cloud.calls.create).toBe(1)
      expect(cloud.calls.update).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('versucht nach vorübergehenden Fehlern mit wachsendem Abstand erneut', async () => {
    vi.useFakeTimers()
    try {
      const a = await device('Anna')
      a.provider.offline = true
      initSpace(a.doc, 'X', 'personal')
      await vi.advanceTimersByTimeAsync(60)
      await a.sync.idle()
      expect(a.sync.snapshot().status).toBe('offline')
      a.provider.offline = false
      await vi.advanceTimersByTimeAsync(4_000)
      expect(cloud.calls.create).toBe(0)
      await vi.advanceTimersByTimeAsync(1_000)
      await a.sync.idle()
      expect(cloud.calls.create).toBe(1)
      expect(a.sync.snapshot().status).toBe('synced')
    } finally {
      vi.useRealTimers()
    }
  })

  it('meldet einen nie synchronisierten Bereich ohne Anmeldung als „nur lokal“', async () => {
    const a = await device('Anna')
    a.provider.loggedIn = false
    initSpace(a.doc, 'X', 'personal')
    await a.sync.flush()
    expect(a.sync.snapshot().status).toBe('local')
  })

  it('erkennt nach einem Neustart ungeschriebene Änderungen', async () => {
    const a = await device('Anna')
    initSpace(a.doc, 'X', 'personal')
    await a.sync.flush()
    a.sync.stop()
    const restart = () =>
      new DocSync({
        doc: a.doc,
        kind: 'live',
        spaceId,
        key,
        deviceId: a.id,
        provider: a.provider,
        store: a.store,
        peers: () => [],
      })
    // Alles geschrieben: nach dem Neustart nichts ausstehend.
    const clean = restart()
    await clean.start()
    expect(clean.hasPendingChanges).toBe(false)
    clean.stop()
    // Änderung ohne laufenden Sync (z. B. App vor dem Schreiben geschlossen).
    createList(a.doc, 'Offline angelegt')
    const dirty = restart()
    await dirty.start()
    expect(dirty.hasPendingChanges).toBe(true)
    await dirty.flush()
    dirty.stop()
    expect(dirty.hasPendingChanges).toBe(false)
  })
})
