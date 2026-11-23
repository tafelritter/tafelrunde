// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Schnittstelle zum Speicheranbieter (plan/03-phase-1-einkaufsliste.md, 1.1).
 *
 * Ein Anbieter kann die eigene Datei anlegen und aktualisieren (mit Anmeldung)
 * und fremde Dateien lesen (ohne Anmeldung, über den Lese-Link). Er sieht nur
 * verschlüsselte Bytes.
 */

export type StorageErrorKind =
  /** Datei existiert nicht (mehr) oder ist nicht freigegeben. */
  | 'not-found'
  /** Kontingent erschöpft oder gedrosselt – später erneut versuchen. */
  | 'rate-limited'
  /** Keine Verbindung. */
  | 'offline'
  /** Kein gültiges Token – Anmeldung nötig. */
  | 'auth'
  /** Sonstiger, vermutlich vorübergehender Fehler. */
  | 'unavailable'

export class StorageError extends Error {
  constructor(
    readonly kind: StorageErrorKind,
    message: string = kind,
    /** Vom Anbieter gewünschte Wartezeit in ms, falls bekannt. */
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'StorageError'
  }
}

export interface RemoteMeta {
  /** Ändert sich mit jedem Schreibvorgang (z. B. md5Checksum oder modifiedTime). */
  version: string
  size: number
}

export interface StorageProvider {
  /** Kennung des Anbieters, wird im Mitglieder-Register gespeichert. */
  readonly id: string
  /** Gibt es ein gültiges Token zum Schreiben? */
  canWrite(): boolean
  /** Legt eine neue Datei an, setzt die Lese-Freigabe und liefert ihre ID. */
  createFile(content: Uint8Array<ArrayBuffer>): Promise<string>
  /** Überschreibt den Inhalt einer eigenen Datei. */
  updateFile(fileId: string, content: Uint8Array<ArrayBuffer>): Promise<void>
  /** Metadaten einer (fremden) Datei, ohne Anmeldung. */
  readMeta(fileId: string): Promise<RemoteMeta>
  /** Inhalt einer (fremden) Datei, ohne Anmeldung. */
  readFile(fileId: string): Promise<Uint8Array>
}
