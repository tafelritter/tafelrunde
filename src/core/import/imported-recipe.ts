// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Rezept aus einer fremden Quelle (Rezeptseite oder Text), bevor es zu
 * Cooklang wird (plan/06-phase-4-import-naehrwerte.md, 4.1). Alle Felder
 * sind reiner Text; die Herkunft gilt als nicht vertrauenswürdig (4.4).
 */
export interface ImportedRecipe {
  title: string
  description?: string
  servings?: number
  /** Ausbeute, wenn keine Portionen angegeben sind (z. B. „1 Kuchen“). */
  yield?: string
  prepMinutes?: number
  cookMinutes?: number
  /** Zutatenzeilen wie auf der Seite. */
  ingredients: string[]
  steps: { section?: string; text: string }[]
  tags: string[]
  /** Adresse der Seite, nur http(s). */
  source?: string
}

/** Obergrenze für eingefügten Text und übergebene Seitendaten. */
export const MAX_IMPORT_CHARS = 200_000

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  ndash: '–',
  mdash: '—',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  deg: '°',
}

/**
 * Macht aus Seitentext reinen Text: Tags und Steuerzeichen raus, Entities
 * auflösen, Leerraum zusammenfassen. Das Ergebnis wird nie als HTML genutzt.
 */
export function plainText(value: unknown, max = 5000): string {
  if (typeof value !== 'string') return ''
  return value
    .slice(0, max * 2)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n =
          code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
        return n > 31 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000)
          ? String.fromCodePoint(n)
          : ' '
      }
      return ENTITIES[code] ?? whole
    })

    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
    .slice(0, max)
}

/** Nur http(s)-Adressen, ohne Zugangsdaten. */
export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
    url.username = ''
    url.password = ''
    url.hash = ''
    return url.href
  } catch {
    return undefined
  }
}
