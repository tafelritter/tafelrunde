// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Zutatenzeilen aus deutschen Rezeptseiten und Texten lesen
 * (plan/06-phase-4-import-naehrwerte.md, 4.1): „1 ½ EL Olivenöl“,
 * „2–3 Zwiebel(n), gewürfelt“, „etwas Salz“, „Pfeffer nach Belieben“.
 */

export interface ParsedIngredientLine {
  /** Menge als Text für Cooklang: „2“, „1.5“, „2-3“, „etwas“; leer ohne Menge. */
  quantity: string
  /** Einheit in Standard-Schreibweise („EL“, „g“), leer ohne Einheit. */
  unit: string
  name: string
  /** Zusatz wie „gewürfelt“ oder „nach Belieben“. */
  note: string
  optional: boolean
}

/** Schreibweisen von Einheiten → Standard. Schlüssel klein, ohne Punkt am Ende. */
const UNIT_SYNONYMS: Record<string, string> = {
  g: 'g',
  gr: 'g',
  gramm: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilogramm: 'kg',
  mg: 'mg',
  ml: 'ml',
  milliliter: 'ml',
  cl: 'cl',
  dl: 'dl',
  l: 'l',
  ltr: 'l',
  liter: 'l',
  el: 'EL',
  essl: 'EL',
  esslöffel: 'EL',
  'gestr. el': 'EL',
  tl: 'TL',
  teel: 'TL',
  teelöffel: 'TL',
  msp: 'Msp.',
  messerspitze: 'Msp.',
  messerspitzen: 'Msp.',
  prise: 'Prise',
  prisen: 'Prise',
  pck: 'Pck.',
  pk: 'Pck.',
  päckchen: 'Pck.',
  packung: 'Pck.',
  packungen: 'Pck.',
  pkg: 'Pck.',
  dose: 'Dose',
  dosen: 'Dose',
  bund: 'Bund',
  becher: 'Becher',
  tasse: 'Tasse',
  tassen: 'Tasse',
  stück: 'Stück',
  stk: 'Stück',
  st: 'Stück',
  zehe: 'Zehe',
  zehen: 'Zehe',
  scheibe: 'Scheibe',
  scheiben: 'Scheibe',
  zweig: 'Zweig',
  zweige: 'Zweig',
  blatt: 'Blatt',
  blätter: 'Blatt',
  glas: 'Glas',
  gläser: 'Glas',
  handvoll: 'Handvoll',
  schuss: 'Schuss',
  spritzer: 'Spritzer',
  würfel: 'Würfel',
  stange: 'Stange',
  stangen: 'Stange',
  knolle: 'Knolle',
  knollen: 'Knolle',
  kopf: 'Kopf',
  köpfe: 'Kopf',
  tropfen: 'Tropfen',
}

const VULGAR: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
}
const VULGAR_CHARS = Object.keys(VULGAR).join('')

/** Ungefähre Mengen ohne Zahl. */
const VAGUE = [
  'etwas',
  'wenig',
  'ein wenig',
  'einige',
  'ein paar',
  'reichlich',
  'eine handvoll',
  'n. b.',
  'n.b.',
]
/** Kennzeichen für optionale Zutaten. */
const OPTIONAL =
  /(?<![\p{L}])(nach belieben|nach geschmack|n\.\s?b\.|evtl\.|eventuell|optional|wer mag)(?=\s|$|[,)])/iu
const OPTIONAL_PREFIX = /^(evtl\.|eventuell|optional|ggf\.)\s+/i

/** Zahl, Bruch („1/2“, „½“, „1 ½“, „1 1/2“) oder Dezimalzahl mit Komma oder Punkt. */
const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[${VULGAR_CHARS}])?|[${VULGAR_CHARS}])`
const AMOUNT = new RegExp(`^(${NUM})(?:\\s*(?:-|–|—|bis)\\s*(${NUM}))?\\s*`, 'i')

function readNumber(text: string): number | undefined {
  const t = text.trim()
  let m = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*([${VULGAR_CHARS}])$`).exec(t)
  if (m) return Number(m[1]!.replace(',', '.')) + VULGAR[m[2]!]!
  m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  m = /^(\d+)\/(\d+)$/.exec(t)
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : undefined
  if (VULGAR[t] !== undefined) return VULGAR[t]
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

/** Zahl für Cooklang: Punkt als Dezimalzeichen, höchstens drei Stellen. */
export function cooklangNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function readUnit(rest: string): { unit: string; rest: string } {
  // Längste passende Einheit zuerst (z. B. „gestr. EL“ vor „g“).
  const m = /^([\p{L}]+\.?(?:\s[\p{L}]+\.?)?)(?=\s|$|[,(])/u.exec(rest)
  if (!m) return { unit: '', rest }
  for (const candidate of [m[1]!, m[1]!.split(/\s/)[0]!]) {
    const key = candidate.toLocaleLowerCase('de-DE').replace(/\.$/, '')
    const unit = UNIT_SYNONYMS[key]
    if (unit) return { unit, rest: rest.slice(candidate.length).trim() }
  }
  return { unit: '', rest }
}

/** Steuerzeichen und Mehrfach-Leerraum entfernen. */
function clean(text: string): string {
  return text

    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseIngredientLine(line: string): ParsedIngredientLine {
  let rest = clean(line)
    .replace(/^[-*•·–]\s*/, '')
    .slice(0, 200)
  const notes: string[] = []
  let quantity = ''
  let optional = false
  const prefix = OPTIONAL_PREFIX.exec(rest)
  if (prefix) {
    optional = true
    rest = rest.slice(prefix[0].length)
  }

  const amount = AMOUNT.exec(rest)
  if (amount) {
    const a = readNumber(amount[1]!)
    const b = amount[2] ? readNumber(amount[2]) : undefined
    if (a !== undefined) {
      quantity =
        b !== undefined && b > a ? `${cooklangNumber(a)}-${cooklangNumber(b)}` : cooklangNumber(a)
      rest = rest.slice(amount[0].length)
    }
  } else {
    const lower = rest.toLocaleLowerCase('de-DE')
    const vague = VAGUE.find((v) => lower === v || lower.startsWith(`${v} `))
    if (vague) {
      quantity = vague === 'n. b.' || vague === 'n.b.' ? '' : vague
      if (!quantity) notes.push('nach Belieben')
      rest = rest.slice(vague.length).trim()
    }
  }

  const { unit, rest: afterUnit } = readUnit(rest)
  rest = afterUnit

  // Zusätze in Klammern, die keine Pluralendung sind: „Zwiebel(n)“ bleibt Name.
  rest = rest.replace(/\(([^)]*)\)/g, (whole, inner: string) => {
    if (/^(n|en|e|s|er)$/i.test(inner.trim())) return whole
    if (inner.trim()) notes.push(inner.trim())
    return ' '
  })
  const comma = rest.indexOf(',')
  if (comma >= 0) {
    notes.push(rest.slice(comma + 1).trim())
    rest = rest.slice(0, comma)
  }
  const opt = OPTIONAL.exec(rest)
  if (opt) {
    optional = true
    notes.push(opt[0])
    rest = rest.replace(OPTIONAL, ' ')
  }
  if (notes.some((n) => OPTIONAL.test(n))) optional = true

  const name = clean(rest.replace(/\(n\)|\(en\)|\(e\)|\(s\)|\(er\)/gi, ''))
    .replace(/^(von|vom|der|die|das)\s+/i, '')
    .replace(/[,;:.]+$/, '')
  return {
    quantity,
    unit,
    name,
    note: clean(notes.filter(Boolean).join(', ')),
    optional,
  }
}
