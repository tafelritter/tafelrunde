// SPDX-License-Identifier: AGPL-3.0-or-later

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { IndexeddbPersistence } from 'y-indexeddb'
import {
  addItem,
  createList,
  decodeCode,
  encodeCode,
  getItems,
  getLists,
  listMembers,
  spaceName,
} from '@/core'
import { FakeCloud, FakeProvider } from '@/core/sync/fake-provider'
import { IdbKeyValueStore, MemoryKeyValueStore } from './kv'
import { type DocPersistence, Workspace } from './workspace'

const noPersistence: DocPersistence = () => Promise.resolve({ destroy: () => undefined })

const idbPersistence: DocPersistence = async (name, doc) => {
  const p = new IndexeddbPersistence(name, doc)
  await p.whenSynced
  return p
}

const open: Workspace[] = []
afterEach(async () => {
  for (const ws of open.splice(0)) await ws.close()
})

async function workspace(cloud: FakeCloud, account: string, kv = new MemoryKeyValueStore()) {
  const provider = new FakeProvider(cloud, account)
  const ws = await Workspace.open({ kv, provider, persistDoc: noPersistence, debounceMs: 10 })
  open.push(ws)
  return { ws, provider, kv }
}

/** Code wie über QR/Link übertragen. */
const transfer = <T extends Parameters<typeof encodeCode>[0]>(code: T) =>
  decodeCode(encodeCode(code)) as T

describe('Workspace', () => {
  it('legt beim Einrichten Profil und persönlichen Bereich an', async () => {
    const { ws } = await workspace(new FakeCloud(), 'anna')
    expect(ws.profile).toBeUndefined()
    await ws.setup(' Anna ', 'Handy')
    expect(ws.profile).toMatchObject({ person: 'Anna', deviceName: 'Handy' })
    const personal = ws.personalSpace()!
    const handle = await ws.space(personal.id)
    expect(spaceName(handle.doc)).toBe('Persönlich')
    expect(listMembers(handle.doc).map((m) => m.person)).toEqual(['Anna'])
  })

  it('übersteht einen Neustart (Profil, Bereiche, Schlüssel, Inhalte)', async () => {
    const kv = await IdbKeyValueStore.open(`test-${Math.random()}`)
    const provider = new FakeProvider(new FakeCloud(), 'anna')
    const first = await Workspace.open({ kv, provider, persistDoc: idbPersistence })
    await first.setup('Anna', 'Laptop')
    const household = await first.createSpace('Familie', 'household')
    createList(household.doc, 'Wocheneinkauf')
    await first.close()

    const second = await Workspace.open({ kv, provider, persistDoc: idbPersistence })
    open.push(second)
    expect(second.profile?.person).toBe('Anna')
    expect(second.spaces().map((s) => s.kind)).toEqual(['personal', 'household'])
    const again = await second.space(household.record.id)
    expect(getLists(again.doc).map((l) => l.name)).toEqual(['Wocheneinkauf'])
    expect(again.record.key.algorithm).toMatchObject({ name: 'AES-GCM' })
  })

  it('lädt ein, tritt bei und synchronisiert in beide Richtungen', async () => {
    const cloud = new FakeCloud()
    const { ws: anna } = await workspace(cloud, 'anna')
    const { ws: ben } = await workspace(cloud, 'ben')
    await anna.setup('Anna', 'Laptop')
    await ben.setup('Ben', 'Handy')

    const family = await anna.createSpace('Familie', 'household')
    const listId = createList(family.doc, 'Wocheneinkauf')
    addItem(family.doc, listId, { name: 'Milch' }, anna.profile!.deviceId)
    await family.sync.flush()
    await family.sync.flush()

    const invite = transfer(await anna.invite(family.record.id))
    expect(invite.peers).toHaveLength(1)
    const joined = await ben.join(invite)
    expect(spaceName(joined.doc)).toBe('Familie')
    expect(getItems(joined.doc, listId).map((i) => i.name)).toEqual(['Milch'])

    const reply = transfer(await ben.reply(family.record.id))
    await anna.acceptReply(reply)
    await family.sync.flush()

    addItem(joined.doc, listId, { name: 'Brot' }, ben.profile!.deviceId)
    await joined.sync.flush()
    await family.sync.poll()
    expect(
      getItems(family.doc, listId)
        .map((i) => i.name)
        .sort(),
    ).toEqual(['Brot', 'Milch'])
    expect(listMembers(family.doc).map((m) => m.person)).toEqual(['Anna', 'Ben'])
    await joined.sync.poll()
    expect(listMembers(joined.doc).map((m) => m.person)).toEqual(['Anna', 'Ben'])
  })

  it('verweigert Einladungen vor dem ersten Abgleich', async () => {
    const { ws, provider } = await workspace(new FakeCloud(), 'anna')
    provider.loggedIn = false
    await ws.setup('Anna', 'Laptop')
    const family = await ws.createSpace('Familie', 'household')
    await expect(ws.invite(family.record.id)).rejects.toThrow(/synchronisiert/)
    expect(family.sync.snapshot().status).toBe('local')
  })

  it('stellt einen Bereich auf einem neuen Gerät aus dem Wiederherstellungscode her', async () => {
    const cloud = new FakeCloud()
    const { ws: old } = await workspace(cloud, 'anna')
    await old.setup('Anna', 'Altes Handy')
    const family = await old.createSpace('Familie', 'household')
    createList(family.doc, 'Vorräte')
    await family.sync.flush()
    await family.sync.flush()
    const code = transfer(await old.recoveryCode(family.record.id))
    expect(code.type).toBe('recovery')
    await old.close()

    const { ws: fresh } = await workspace(cloud, 'anna')
    await fresh.setup('Anna', 'Neues Handy')
    const restored = await fresh.join(code)
    expect(getLists(restored.doc).map((l) => l.name)).toEqual(['Vorräte'])
    expect(listMembers(restored.doc).map((m) => m.deviceName)).toEqual([
      'Altes Handy',
      'Neues Handy',
    ])
  })

  it('nimmt entfernte Geräte nicht wieder auf', async () => {
    const cloud = new FakeCloud()
    const { ws } = await workspace(cloud, 'anna')
    await ws.setup('Anna', 'Laptop')
    const family = await ws.createSpace('Familie', 'household')
    const { markRemoved } = await import('@/core')
    const reply = {
      type: 'reply' as const,
      spaceId: family.record.id,
      deviceId: 'evil',
      person: 'X',
      deviceName: 'Y',
      provider: 'fake',
      files: { live: 'f' },
    }
    await ws.acceptReply(reply)
    markRemoved(family.doc, 'evil', 1)
    await expect(ws.acceptReply(reply)).rejects.toThrow(/entfernt/)
  })

  it('entfernt ein Gerät und wechselt den Schlüssel', async () => {
    const cloud = new FakeCloud()
    const { ws: anna } = await workspace(cloud, 'anna')
    const { ws: ben } = await workspace(cloud, 'ben')
    const { ws: cleo } = await workspace(cloud, 'cleo')
    await anna.setup('Anna', 'Laptop')
    await ben.setup('Ben', 'Handy')
    await cleo.setup('Cleo', 'Tablet')

    const family = await anna.createSpace('Familie', 'household')
    const listId = createList(family.doc, 'Liste')
    await family.sync.flush()
    await family.sync.flush()
    const invite = transfer(await anna.invite(family.record.id))
    const benSpace = await ben.join(invite)
    await anna.acceptReply(transfer(await ben.reply(family.record.id)))
    const cleoSpace = await cleo.join(invite)
    await anna.acceptReply(transfer(await cleo.reply(family.record.id)))
    await family.sync.flush()
    const oldKey = invite.key

    // Ben wird entfernt.
    await anna.removeDevice(family.record.id, ben.profile!.deviceId)
    const rekey = transfer(await anna.invite(family.record.id))
    expect(rekey.key).not.toBe(oldKey)
    addItem(family.doc, listId, { name: 'Geheim nach Entfernen' }, anna.profile!.deviceId)
    await family.sync.flush()

    // Ben liest mit dem alten Schlüssel nichts Neues mehr.
    await benSpace.sync.poll()
    expect(getItems(benSpace.doc, listId)).toEqual([])
    expect(benSpace.sync.snapshot().problems).toMatchObject({
      [anna.profile!.deviceId]: 'undecryptable',
    })

    // Cleo hat den Schlüssel noch nicht: Anna liest Cleo weiterhin mit dem alten Schlüssel.
    addItem(cleoSpace.doc, listId, { name: 'Von Cleo, alter Schlüssel' }, cleo.profile!.deviceId)
    await cleoSpace.sync.flush()
    await family.sync.poll()
    expect(getItems(family.doc, listId).map((i) => i.name)).toContain('Von Cleo, alter Schlüssel')

    // Cleo übernimmt den neuen Schlüssel per Schlüssel-Code und sieht alles.
    await cleo.join(rekey)
    await cleoSpace.sync.poll()
    expect(getItems(cleoSpace.doc, listId).map((i) => i.name)).toContain('Geheim nach Entfernen')
    await cleoSpace.sync.flush()
    await benSpace.sync.poll()
    expect(getItems(benSpace.doc, listId).map((i) => i.name)).not.toContain('Geheim nach Entfernen')
    expect(listMembers(cleoSpace.doc).map((m) => m.person)).toEqual(['Anna', 'Cleo'])
  })

  it('teilt eine einzelne Liste: Haushalt tritt automatisch bei, Externe per Einladung', async () => {
    const cloud = new FakeCloud()
    const { ws: anna } = await workspace(cloud, 'anna')
    const { ws: ben } = await workspace(cloud, 'ben')
    const { ws: gast } = await workspace(cloud, 'gast')
    await anna.setup('Anna', 'Laptop')
    await ben.setup('Ben', 'Handy')
    await gast.setup('Gast', 'Handy')

    // Haushalt mit Anna und Ben
    const family = await anna.createSpace('Familie', 'household')
    const listId = createList(family.doc, 'Grillfest')
    addItem(family.doc, listId, { name: 'Kohle' }, anna.profile!.deviceId)
    const { setItemCategory } = await import('@/core')
    const kohle = getItems(family.doc, listId)[0]!.id
    setItemCategory(family.doc, kohle, 'sonstiges')
    await family.sync.flush()
    await family.sync.flush()
    const benFamily = await ben.join(transfer(await anna.invite(family.record.id)))
    await anna.acceptReply(transfer(await ben.reply(family.record.id)))
    await family.sync.flush()

    // Anna überführt die Liste in einen eigenen Bereich.
    const party = await anna.shareList(family.record.id, listId)
    expect(getLists(family.doc)).toEqual([])
    expect(getItems(party.doc, listId)).toMatchObject([{ name: 'Kohle', category: 'sonstiges' }])
    await party.sync.flush()
    await anna.syncLinks()
    await family.sync.flush()

    // Ben bekommt den Haushalt, sieht die Verknüpfung und tritt bei.
    await benFamily.sync.poll()
    await ben.syncLinks()
    expect(ben.hasSpace(party.record.id)).toBe(true)
    const benParty = await ben.space(party.record.id)
    expect(getItems(benParty.doc, listId).map((i) => i.name)).toEqual(['Kohle'])
    await benParty.sync.flush()
    await ben.syncLinks()
    await benFamily.sync.flush()

    // Anna erfährt Bens Datei über den Haushalt und liest seine Änderungen.
    await family.sync.poll()
    await anna.syncLinks()
    addItem(benParty.doc, listId, { name: 'Würstchen' }, ben.profile!.deviceId)
    await benParty.sync.flush()
    await party.sync.poll()
    expect(
      getItems(party.doc, listId)
        .map((i) => i.name)
        .sort(),
    ).toEqual(['Kohle', 'Würstchen'])

    // Ein Gast wird ganz normal eingeladen und sieht nur diese Liste.
    await party.sync.flush()
    const gastParty = await gast.join(transfer(await anna.invite(party.record.id)))
    expect(
      getItems(gastParty.doc, listId)
        .map((i) => i.name)
        .sort(),
    ).toEqual(['Kohle', 'Würstchen'])
    expect(gast.spaces().map((s) => s.kind)).toEqual(['personal', 'shared-list'])
  })

  it('synchronisiert das Dokument library über eine eigene Datei', async () => {
    const cloud = new FakeCloud()
    const { ws: anna } = await workspace(cloud, 'anna')
    const { ws: ben } = await workspace(cloud, 'ben')
    await anna.setup('Anna', 'Laptop')
    await ben.setup('Ben', 'Handy')
    const family = await anna.createSpace('Familie', 'household')
    await family.sync.flush()
    await family.sync.flush()
    const benFamily = await ben.join(transfer(await anna.invite(family.record.id)))
    await anna.acceptReply(transfer(await ben.reply(family.record.id)))

    const { createRecipe, listRecipes, setReview, getReviews } = await import('@/core')
    const id = createRecipe(
      family.library!.doc,
      '---\ntitle: Hefeteig\n---\n',
      anna.profile!.personId,
    )
    await family.library!.sync.flush()
    // Die library-Datei steht danach im Register von live.
    await family.sync.flush()
    await benFamily.sync.poll()
    await benFamily.library!.sync.poll()
    expect(listRecipes(benFamily.library!.doc).map((r) => r.id)).toEqual([id])

    setReview(benFamily.library!.doc, id, ben.profile!.personId, { stars: 4 })
    await benFamily.library!.sync.flush()
    await benFamily.sync.flush()
    await family.sync.poll()
    await family.library!.sync.poll()
    expect(getReviews(family.library!.doc, id)).toMatchObject([
      { personId: ben.profile!.personId, stars: 4 },
    ])
    expect(cloud.files.size).toBeGreaterThanOrEqual(4)
  })

  it('übernimmt die Person beim Beitritt zum eigenen persönlichen Bereich', async () => {
    const cloud = new FakeCloud()
    const { ws: laptop } = await workspace(cloud, 'anna')
    const { ws: phone } = await workspace(cloud, 'anna')
    await laptop.setup('Anna', 'Laptop')
    await phone.setup('Anna', 'Handy')
    expect(phone.profile!.personId).not.toBe(laptop.profile!.personId)
    const personal = await laptop.space(laptop.personalSpace()!.id)
    await personal.sync.flush()
    await personal.sync.flush()
    await phone.join(transfer(await laptop.invite(personal.record.id)))
    expect(phone.profile!.personId).toBe(laptop.profile!.personId)
  })

  it('teilt ein Rezept samt Unterrezept; Empfänger liest ohne Konto und übernimmt es', async () => {
    const cloud = new FakeCloud()
    const { ws: anna } = await workspace(cloud, 'anna')
    const { ws: gast, provider: gastProvider } = await workspace(cloud, 'gast')
    gastProvider.loggedIn = false
    await anna.setup('Anna', 'Laptop')
    await gast.setup('Gast', 'Handy')
    const { createRecipe, listRecipes, spaceKind } = await import('@/core')
    const personal = await anna.space(anna.personalSpace()!.id)
    const me = anna.profile!.personId
    createRecipe(personal.library!.doc, '---\ntitle: Hefeteig\nyield: 800 g\n---\n@Mehl{500%g}', me)
    const kuchen = createRecipe(
      personal.library!.doc,
      '---\ntitle: Kuchen\n---\n@./Hefeteig{400%g}',
      me,
    )
    createRecipe(personal.library!.doc, '---\ntitle: Geheim\n---\nNicht teilen', me)

    const share = await anna.shareRecipe(personal.record.id, kuchen)
    expect(spaceKind(share.doc)).toBe('recipe-share')
    expect(
      listRecipes(share.library!.doc)
        .map((r) => r.source.split('\n')[1])
        .sort(),
    ).toEqual(['title: Hefeteig', 'title: Kuchen'])
    for (const h of [share.library!, share]) await h.sync.flush()
    await share.sync.flush()

    const received = await gast.join(transfer(await anna.invite(share.record.id)))
    await received.library!.sync.poll()
    const recipes = listRecipes(received.library!.doc)
    expect(recipes).toHaveLength(2)
    const kuchenCopy = recipes.find((r) => r.source.includes('Kuchen'))!
    const adopted = await gast.adoptRecipe(share.record.id, kuchenCopy.id, gast.personalSpace()!.id)
    const mine = await gast.space(gast.personalSpace()!.id)
    expect(listRecipes(mine.library!.doc).find((r) => r.id === adopted)?.origin).toMatchObject({
      kind: 'shared',
    })
  })

  it('lädt Fotos verschlüsselt hoch, sobald angemeldet, und andere Geräte laden sie', async () => {
    const cloud = new FakeCloud()
    const { ws: anna, provider } = await workspace(cloud, 'anna')
    const { ws: ben } = await workspace(cloud, 'ben')
    await anna.setup('Anna', 'Laptop')
    await ben.setup('Ben', 'Handy')
    const family = await anna.createSpace('Familie', 'household')
    await family.sync.flush()
    await family.sync.flush()
    const benFamily = await ben.join(transfer(await anna.invite(family.record.id)))
    await anna.acceptReply(transfer(await ben.reply(family.record.id)))

    const { createRecipe, listPhotos } = await import('@/core')
    const recipeId = createRecipe(
      family.library!.doc,
      '---\ntitle: Kuchen\n---\n',
      anna.profile!.personId,
    )
    const bytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3])

    // Offline hinzugefügt: liegt lokal, noch ohne Datei.
    provider.loggedIn = false
    const photoId = await anna.addPhoto(family.record.id, recipeId, bytes, { width: 4, height: 3 })
    expect(listPhotos(family.library!.doc, recipeId)[0]?.fileId).toBeUndefined()
    expect(await anna.loadPhoto(family.record.id, photoId)).toEqual(bytes)

    // Nach dem Login hochgeladen – verschlüsselt.
    provider.loggedIn = true
    await anna.flushAll()
    const ref = listPhotos(family.library!.doc, recipeId)[0]!
    expect(ref.fileId).toBeDefined()
    const stored = cloud.files.get(ref.fileId!)!.content
    expect(new TextDecoder().decode(stored)).not.toContain('RIFF')
    await anna.flushAll()
    await family.sync.flush()

    // Ben bekommt Verweis und Datei.
    await benFamily.sync.poll()
    await benFamily.library!.sync.poll()
    expect(await ben.loadPhoto(family.record.id, photoId)).toEqual(bytes)
    const reads = cloud.calls.read
    await ben.loadPhoto(family.record.id, photoId)
    expect(cloud.calls.read).toBe(reads) // aus dem lokalen Speicher

    await anna.removePhoto(family.record.id, photoId)
    expect(listPhotos(family.library!.doc, recipeId)).toEqual([])
  })
})
