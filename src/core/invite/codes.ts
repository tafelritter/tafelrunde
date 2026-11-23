// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Einladung, Antwort-Code und Wiederherstellungscode
 * (plan/01-architektur.md, „Einladen“ und „Wiederherstellung“).
 *
 * - Einladung und Wiederherstellungscode enthalten den Bereichsschlüssel und
 *   stehen deshalb nur im URL-Fragment (`#/beitreten/…`), nie in Pfad oder
 *   Query – das Fragment wird nicht an Server gesendet.
 * - Der Antwort-Code enthält keinen Schlüssel und muss nicht geheim sein:
 *   Eine untergeschobene Datei lässt sich ohne Schlüssel nicht entschlüsseln.
 *
 * Kodierung: kompaktes JSON als base64url, damit es in Links und QR-Codes passt.
 * Alles, was hereinkommt, ist untrusted und wird streng geprüft.
 */

import { fromBase64url, toBase64url } from '../crypto/base64url'
import { isValidId } from '../crypto/ids'
import { type FileRefs, type SpaceKind, SPACE_KINDS } from '../model/space'
import { type GoogleConfig, parseGoogleConfig } from './google-config'

const VERSION = 1
const MAX_PEERS = 32
const MAX_TEXT = 100
const MAX_CODE_CHARS = 8000

export interface PeerRef {
  deviceId: string
  provider: string
  files: FileRefs
}

/** Einladung oder Wiederherstellung: alles, um einen Bereich zu lesen. */
export interface SpaceAccess {
  type: 'invite' | 'recovery'
  spaceId: string
  /** Bereichsschlüssel als base64url (256 Bit). */
  key: string
  name: string
  kind: SpaceKind
  peers: PeerRef[]
  /** Google-Projekt des einladenden Geräts, damit neue Geräte ohne Einrichtung lesen können. */
  google?: GoogleConfig
}

/** Antwort des neuen Geräts an das einladende. */
export interface JoinReply {
  type: 'reply'
  spaceId: string
  deviceId: string
  person: string
  deviceName: string
  provider: string
  files: FileRefs
}

export type Code = SpaceAccess | JoinReply

export class CodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodeError'
  }
}

// --- Kodieren -----------------------------------------------------------------

const TYPE_TAG = { invite: 'i', recovery: 'w', reply: 'r' } as const

function compactFiles(files: FileRefs): Record<string, string> {
  const out: Record<string, string> = {}
  if (files.live) out.l = files.live
  if (files.library) out.b = files.library
  return out
}

export function encodeCode(code: Code): string {
  const body =
    code.type === 'reply'
      ? {
          s: code.spaceId,
          d: code.deviceId,
          p: code.person,
          n: code.deviceName,
          r: code.provider,
          f: compactFiles(code.files),
        }
      : {
          s: code.spaceId,
          k: code.key,
          n: code.name,
          t: code.kind,
          m: code.peers.map((p) => ({ d: p.deviceId, r: p.provider, f: compactFiles(p.files) })),
          ...(code.google ? { g: { c: code.google.clientId, a: code.google.apiKey } } : {}),
        }
  const json = JSON.stringify({ v: VERSION, y: TYPE_TAG[code.type], ...body })
  return toBase64url(new TextEncoder().encode(json))
}

// --- Dekodieren ---------------------------------------------------------------

type Obj = Record<string, unknown>

function obj(value: unknown, what: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CodeError(`${what}: kein Objekt`)
  }
  return value as Obj
}

function id(value: unknown, what: string): string {
  if (!isValidId(value)) throw new CodeError(`${what}: ungültige ID`)
  return value
}

function text(value: unknown, what: string, required = true): string {
  if (typeof value !== 'string' || value.length > MAX_TEXT || (required && !value.trim())) {
    throw new CodeError(`${what}: ungültiger Text`)
  }
  // Steuer- und Bidi-Zeichen entfernen (Schutz vor vorgetäuschten Namen);
  // angezeigt wird ohnehin nur als Text.
  return value.replace(/[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '').trim()
}

function files(value: unknown): FileRefs {
  const o = obj(value ?? {}, 'Dateien')
  const out: FileRefs = {}
  if (o.l !== undefined) out.live = id(o.l, 'Datei live')
  if (o.b !== undefined) out.library = id(o.b, 'Datei library')
  return out
}

function kind(value: unknown): SpaceKind {
  if (SPACE_KINDS.includes(value as SpaceKind)) return value as SpaceKind
  throw new CodeError('unbekannte Bereichsart')
}

function key(value: unknown): string {
  if (typeof value !== 'string') throw new CodeError('Schlüssel fehlt')
  let raw: Uint8Array
  try {
    raw = fromBase64url(value)
  } catch {
    throw new CodeError('Schlüssel ungültig')
  }
  if (raw.length !== 32) throw new CodeError('Schlüssel hat falsche Länge')
  return value
}

/** Akzeptiert den reinen Code oder einen ganzen Link mit `#/beitreten/<code>` bzw. `#/antwort/<code>`. */
export function extractCode(input: string): string {
  const trimmed = input.trim()
  const match = /#\/(?:beitreten|antwort|wiederherstellen)\/([A-Za-z0-9_-]+)/.exec(trimmed)
  return match ? match[1]! : trimmed
}

export function decodeCode(input: string): Code {
  const code = extractCode(input)
  if (code.length === 0 || code.length > MAX_CODE_CHARS)
    throw new CodeError('Code fehlt oder ist zu lang')
  let o: Obj
  try {
    o = obj(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64url(code))),
      'Code',
    )
  } catch (error) {
    if (error instanceof CodeError) throw error
    throw new CodeError('Code ist beschädigt')
  }
  if (o.v !== VERSION) throw new CodeError('Code stammt aus einer anderen Version')

  if (o.y === TYPE_TAG.reply) {
    return {
      type: 'reply',
      spaceId: id(o.s, 'Bereich'),
      deviceId: id(o.d, 'Gerät'),
      person: text(o.p, 'Person'),
      deviceName: text(o.n, 'Gerätename', false),
      provider: text(o.r, 'Anbieter'),
      files: files(o.f),
    }
  }
  if (o.y === TYPE_TAG.invite || o.y === TYPE_TAG.recovery) {
    if (!Array.isArray(o.m) || o.m.length > MAX_PEERS) throw new CodeError('Geräteliste ungültig')
    const peers = o.m.map((entry) => {
      const p = obj(entry, 'Gerät')
      return { deviceId: id(p.d, 'Gerät'), provider: text(p.r, 'Anbieter'), files: files(p.f) }
    })
    const access: SpaceAccess = {
      type: o.y === TYPE_TAG.invite ? 'invite' : 'recovery',
      spaceId: id(o.s, 'Bereich'),
      key: key(o.k),
      name: text(o.n, 'Name', false),
      kind: kind(o.t),
      peers,
    }
    if (o.g !== undefined) {
      const g = obj(o.g, 'Google-Konfiguration')
      const google = parseGoogleConfig({ clientId: g.c, apiKey: g.a })
      if (!google) throw new CodeError('Google-Konfiguration ungültig')
      access.google = google
    }
    return access
  }
  throw new CodeError('unbekannte Code-Art')
}

/** Link für Einladung/Wiederherstellung (Schlüssel im Fragment) bzw. Antwort. */
export function codeLink(baseUrl: string, code: Code): string {
  const route =
    code.type === 'reply' ? 'antwort' : code.type === 'invite' ? 'beitreten' : 'wiederherstellen'
  const base = baseUrl.replace(/#.*$/, '')
  return `${base}#/${route}/${encodeCode(code)}`
}
