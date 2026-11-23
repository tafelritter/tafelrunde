// SPDX-License-Identifier: AGPL-3.0-or-later
import source from './bookmarklet-source.js?raw'

/** Lesbarer Quelltext des Bookmarklets (wird auf der Installationsseite gezeigt). */
export const bookmarkletSource = source

/** Adresse der App, an die das Bookmarklet die Daten übergibt. */
export function appUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href
}

/** `javascript:`-Link zum Ziehen in die Lesezeichenleiste. */
export function bookmarkletHref(app = appUrl()): string {
  const code = source.replace(/^\/\*[\s\S]*?\*\/\s*/, '').replace('__APP_URL__', app)
  return `javascript:${encodeURIComponent(code)}`
}

export interface BookmarkletData {
  url: string
  title: string
  blocks: string[]
  text: string
}

/** Prüft die Nachricht des Bookmarklets (nicht vertrauenswürdig, Größen begrenzt). */
export function readBookmarkletMessage(data: unknown): BookmarkletData | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const d = data as Record<string, unknown>
  if (d.type !== 'tafelrunde-import' || d.version !== 1) return undefined
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  const blocks = Array.isArray(d.blocks)
    ? d.blocks.slice(0, 21).flatMap((b) => (typeof b === 'string' ? [b.slice(0, 500_000)] : []))
    : []
  return {
    url: str(d.url, 2000),
    title: str(d.title, 300),
    blocks,
    text: str(d.text, 100_000),
  }
}
