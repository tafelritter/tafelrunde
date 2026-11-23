// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  getMember,
  initSpace,
  listMembers,
  markRemoved,
  peerFiles,
  renameDevice,
  renameSpace,
  setMemberFile,
  spaceKind,
  spaceName,
  upsertMember,
} from './space'

const member = (deviceId: string, joinedAt: number) => ({
  deviceId,
  person: `P-${deviceId}`,
  deviceName: `G-${deviceId}`,
  provider: 'gdrive',
  joinedAt,
})

describe('Bereich', () => {
  it('setzt Name und Art nur einmal, umbenennen geht', () => {
    const doc = new Y.Doc()
    initSpace(doc, 'Familie', 'household')
    initSpace(doc, 'Anders', 'personal')
    expect([spaceName(doc), spaceKind(doc)]).toEqual(['Familie', 'household'])
    renameSpace(doc, ' Müllers ')
    expect(spaceName(doc)).toBe('Müllers')
  })
})

describe('Mitglieder-Register', () => {
  it('trägt Geräte ein, sortiert nach Beitritt', () => {
    const doc = new Y.Doc()
    upsertMember(doc, member('b', 2))
    upsertMember(doc, { ...member('a', 1), files: { live: 'f1' } })
    expect(listMembers(doc).map((m) => m.deviceId)).toEqual(['a', 'b'])
    expect(getMember(doc, 'a')).toEqual({ ...member('a', 1), files: { live: 'f1' } })
  })

  it('behält den ersten Beitrittszeitpunkt', () => {
    const doc = new Y.Doc()
    upsertMember(doc, member('a', 1))
    upsertMember(doc, member('a', 99))
    expect(getMember(doc, 'a')?.joinedAt).toBe(1)
  })

  it('lehnt ungültige Geräte-IDs ab', () => {
    expect(() => upsertMember(new Y.Doc(), member('a/b', 1))).toThrow()
  })

  it('führt gleichzeitige Änderungen am selben Gerät zusammen', () => {
    const a = new Y.Doc()
    upsertMember(a, member('x', 1))
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    renameDevice(a, 'x', 'Küchentablet')
    setMemberFile(b, 'x', 'library', 'lib1')
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    expect(getMember(a, 'x')).toMatchObject({
      deviceName: 'Küchentablet',
      files: { library: 'lib1' },
    })
  })

  it('blendet entfernte Geräte aus und liefert Peers ohne sich selbst', () => {
    const doc = new Y.Doc()
    upsertMember(doc, { ...member('a', 1), files: { live: 'fa' } })
    upsertMember(doc, { ...member('b', 2), files: { live: 'fb' } })
    upsertMember(doc, { ...member('c', 3), files: { live: 'fc', library: 'lc' } })
    upsertMember(doc, member('d', 4))
    markRemoved(doc, 'b', 10)
    expect(listMembers(doc).map((m) => m.deviceId)).toEqual(['a', 'c', 'd'])
    expect(listMembers(doc, { includeRemoved: true })).toHaveLength(4)
    expect(peerFiles(doc, 'live', 'a')).toEqual([{ deviceId: 'c', fileId: 'fc' }])
    expect(peerFiles(doc, 'library', 'a')).toEqual([{ deviceId: 'c', fileId: 'lc' }])
  })

  it('verliert keine Felder, wenn zwei Geräte denselben Eintrag gleichzeitig anlegen', () => {
    // Einladendes Gerät trägt das neue ein (Antwort-Code), das neue sich selbst.
    const inviter = new Y.Doc()
    const joiner = new Y.Doc()
    upsertMember(inviter, { ...member('neu', 5), files: { live: 'f-neu' } })
    upsertMember(joiner, member('neu', 4))
    renameDevice(joiner, 'neu', 'Tablet')
    Y.applyUpdate(inviter, Y.encodeStateAsUpdate(joiner))
    Y.applyUpdate(joiner, Y.encodeStateAsUpdate(inviter))
    // Datei-ID nur beim Einladenden, Gerätename von beiden gesetzt (einer gewinnt).
    expect(getMember(inviter, 'neu')).toEqual(getMember(joiner, 'neu'))
    expect(getMember(joiner, 'neu')?.files).toEqual({ live: 'f-neu' })
    expect(['Tablet', 'G-neu']).toContain(getMember(joiner, 'neu')?.deviceName)
  })

  it('ignoriert Einträge ohne Beitrittszeitpunkt und ungültige Datei-IDs', () => {
    const doc = new Y.Doc()
    doc.getMap('members').set('x/file:live', 'f')
    doc.getMap('members').set('y/joinedAt', 1)
    doc.getMap('members').set('y/file:live', '../evil')
    expect(listMembers(doc).map((m) => [m.deviceId, m.files])).toEqual([['y', {}]])
  })
})
