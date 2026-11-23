// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Verschlüsseltes Dateiformat v1 (siehe plan/01-architektur.md, „Dateiformat“).
 *
 * AES-256-GCM, zufälliger 96-Bit-IV pro Schreibvorgang. Die AAD
 * `tafelrunde/v1/<space>/<doc>/<device>/<seq>` bindet den Inhalt an Bereich,
 * Dokument, Gerät und Version: Vertauschte, umbenannte oder manipulierte
 * Dateien lassen sich nicht entschlüsseln.
 */

import { fromBase64url, toBase64url } from './base64url'
import { isValidId } from './ids'

export const ENVELOPE_VERSION = 1
export const DOC_KINDS = ['live', 'library'] as const
export type DocKind = (typeof DOC_KINDS)[number]
/**
 * Arten verschlüsselter Dateien: die Dokumente eines Bereichs und Fotos.
 * Bei Fotos steht im Feld `device` die Foto-ID, `seq` ist 0 (Fotos ändern sich nicht).
 */
export const ENVELOPE_KINDS = [...DOC_KINDS, 'photo'] as const
export type EnvelopeKind = (typeof ENVELOPE_KINDS)[number]

const IV_BYTES = 12
const KEY_BYTES = 32
/** Obergrenze gegen übergroße untergeschobene Dateien (16 MiB Base64). */
const MAX_CT_CHARS = 16 * 1024 * 1024

export interface Envelope {
  v: typeof ENVELOPE_VERSION
  space: string
  doc: EnvelopeKind
  device: string
  seq: number
  iv: string
  ct: string
}

export interface EnvelopeHeader {
  space: string
  doc: EnvelopeKind
  device: string
  seq: number
}

export class EnvelopeError extends Error {
  constructor(
    message: string,
    readonly reason: 'format' | 'binding' | 'decrypt',
  ) {
    super(message)
    this.name = 'EnvelopeError'
  }
}

export function aadFor(header: EnvelopeHeader): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    `tafelrunde/v${ENVELOPE_VERSION}/${header.space}/${header.doc}/${header.device}/${header.seq}`,
  )
}

// --- Schlüssel ---------------------------------------------------------------

export async function generateSpaceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function exportSpaceKey(key: CryptoKey): Promise<string> {
  return toBase64url(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
}

export async function importSpaceKey(encoded: string, extractable = true): Promise<CryptoKey> {
  const raw = fromBase64url(encoded)
  if (raw.length !== KEY_BYTES) throw new Error('Schlüssel muss 256 Bit lang sein')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extractable, [
    'encrypt',
    'decrypt',
  ])
}

// --- Ver- und Entschlüsseln --------------------------------------------------

function assertHeader(h: EnvelopeHeader): void {
  if (!isValidId(h.space) || !isValidId(h.device)) throw new EnvelopeError('ungültige ID', 'format')
  if (!(ENVELOPE_KINDS as readonly string[]).includes(h.doc))
    throw new EnvelopeError('unbekanntes Dokument', 'format')
  if (!Number.isSafeInteger(h.seq) || h.seq < 0) throw new EnvelopeError('ungültige seq', 'format')
}

export async function sealEnvelope(
  key: CryptoKey,
  header: EnvelopeHeader,
  plaintext: Uint8Array,
  iv: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(IV_BYTES)),
): Promise<Envelope> {
  assertHeader(header)
  if (iv.length !== IV_BYTES) throw new Error('IV muss 96 Bit lang sein')
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadFor(header) },
    key,
    // WebCrypto verlangt einen ArrayBuffer-gestützten Puffer (kein SharedArrayBuffer).
    plaintext.buffer instanceof ArrayBuffer
      ? (plaintext as Uint8Array<ArrayBuffer>)
      : plaintext.slice(),
  )
  return {
    v: ENVELOPE_VERSION,
    space: header.space,
    doc: header.doc,
    device: header.device,
    seq: header.seq,
    iv: toBase64url(iv),
    ct: toBase64url(new Uint8Array(ct)),
  }
}

/** Prüft eine untrusted JSON-Struktur streng auf das Format v1. */
export function parseEnvelope(input: unknown): Envelope {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new EnvelopeError('kein Objekt', 'format')
  }
  const o = input as Record<string, unknown>
  if (o.v !== ENVELOPE_VERSION) throw new EnvelopeError('unbekannte Version', 'format')
  if (typeof o.iv !== 'string' || typeof o.ct !== 'string') {
    throw new EnvelopeError('iv/ct fehlen', 'format')
  }
  if (o.ct.length > MAX_CT_CHARS) throw new EnvelopeError('zu groß', 'format')
  const header = { space: o.space, doc: o.doc, device: o.device, seq: o.seq } as EnvelopeHeader
  assertHeader(header)
  return { v: ENVELOPE_VERSION, ...header, iv: o.iv, ct: o.ct }
}

/**
 * Entschlüsselt eine Datei. `expected` sind die Werte, unter denen die Datei
 * im Register geführt wird; weicht der Kopf davon ab, wird sie verworfen,
 * bevor überhaupt entschlüsselt wird.
 */
export async function openEnvelope(
  key: CryptoKey,
  envelope: Envelope,
  expected: Omit<EnvelopeHeader, 'seq'>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (
    envelope.space !== expected.space ||
    envelope.doc !== expected.doc ||
    envelope.device !== expected.device
  ) {
    throw new EnvelopeError('Datei gehört nicht zu diesem Bereich/Gerät', 'binding')
  }
  let iv: Uint8Array<ArrayBuffer>
  let ct: Uint8Array<ArrayBuffer>
  try {
    iv = fromBase64url(envelope.iv)
    ct = fromBase64url(envelope.ct)
  } catch {
    throw new EnvelopeError('ungültiges base64url', 'format')
  }
  if (iv.length !== IV_BYTES) throw new EnvelopeError('IV hat falsche Länge', 'format')
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aadFor(envelope) },
      key,
      ct,
    )
    return new Uint8Array(pt)
  } catch {
    throw new EnvelopeError('Entschlüsselung fehlgeschlagen', 'decrypt')
  }
}

export function encodeEnvelope(envelope: Envelope): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(envelope))
}

export function decodeEnvelope(bytes: Uint8Array): Envelope {
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new EnvelopeError('kein gültiges JSON', 'format')
  }
  return parseEnvelope(json)
}
