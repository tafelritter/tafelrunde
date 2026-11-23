// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Rezept aus markiertem oder eingefügtem Text (plan/06-phase-4-import-naehrwerte.md, 4.3).
 * Erkennt die Abschnitte „Zutaten“ und „Zubereitung“; ohne Überschriften
 * gelten kurze Zeilen mit Mengenangabe als Zutaten, der Rest als Schritte.
 */

import { parseDuration } from '@tafelritter/rezeptformat/basis'
import { parseIngredientLine } from './ingredient-line'
import { type ImportedRecipe, MAX_IMPORT_CHARS, plainText, safeSourceUrl } from './imported-recipe'

const INGREDIENTS = /^(zutaten|einkaufsliste|das brauchst du|du brauchst)\b.*$/i
const STEPS =
  /^(zubereitung|anleitung|arbeitsschritte|so geht('|’)?s|so wird('|’)?s gemacht|und so wird('|’)?s gemacht|schritte|zubereitungsschritte|methode)\b.*$/i
const URL_PATTERN = /https?:\/\/[^\s<>"]+/i
const SERVINGS =
  /(?:für|ergibt|zutaten für)\s+(\d+(?:[.,]\d+)?)\s*(portionen|personen|person|stück)\b/i
const SERVINGS_ALONE = /^(\d+(?:[.,]\d+)?)\s*(portionen|personen)\b/i
const PREP =
  /(arbeitszeit|vorbereitung(?:szeit)?|zubereitungszeit)\s*:?\s*(?:ca\.?\s*)?([^\n|]{1,30})/i
const COOK =
  /(koch-?\s*\/?\s*backzeit|kochzeit|backzeit|garzeit|ruhezeit)\s*:?\s*(?:ca\.?\s*)?([^\n|]{1,30})/i

export interface TextImport {
  recipe: ImportedRecipe
  /** Es wurde nur eine Adresse geteilt, kein Rezepttext. */
  onlyUrl: boolean
}

function looksLikeIngredient(line: string): boolean {
  if (line.length > 70 || /[.!?]$/.test(line)) return false
  const p = parseIngredientLine(line)
  return !!p.name && (!!p.quantity || !!p.unit)
}

export function parseRecipeText(input: string, sharedTitle = '', sharedUrl = ''): TextImport {
  const text = plainText(input.slice(0, MAX_IMPORT_CHARS), MAX_IMPORT_CHARS)
  const url = safeSourceUrl(sharedUrl) ?? safeSourceUrl(URL_PATTERN.exec(text)?.[0])
  const withoutUrls = text.replace(new RegExp(URL_PATTERN, 'gi'), ' ').trim()
  const recipe: ImportedRecipe = { title: '', ingredients: [], steps: [], tags: [] }
  if (url) recipe.source = url
  if (!withoutUrls) {
    recipe.title = plainText(sharedTitle, 200) || 'Importiertes Rezept'
    return { recipe, onlyUrl: !!url }
  }

  const lines = withoutUrls
    .split('\n')
    .map((l) => l.replace(/^[\s•·▪●◦*-]+/, '').trim())
    .filter(Boolean)

  // Kennzahlen aus dem ganzen Text
  const servings = SERVINGS.exec(withoutUrls)
  if (servings) recipe.servings = Number(servings[1]!.replace(',', '.'))
  const prep = PREP.exec(withoutUrls)
  const cook = COOK.exec(withoutUrls)
  const prepMinutes = prep ? parseDuration(prep[2]!) : undefined
  const cookMinutes = cook ? parseDuration(cook[2]!) : undefined
  if (prepMinutes) recipe.prepMinutes = prepMinutes
  if (cookMinutes) recipe.cookMinutes = cookMinutes

  const isMeta = (l: string) =>
    SERVINGS_ALONE.test(l) ||
    (SERVINGS.test(l) && l.length < 40) ||
    /^(arbeitszeit|kochzeit|backzeit|ruhezeit|gesamtzeit|zubereitungszeit|schwierigkeit|kalorien|portionen)\b/i.test(
      l,
    )

  // Titel: geteilter Titel oder die erste kurze Zeile, die keine Überschrift ist
  let start = 0
  const first = lines[0] ?? ''
  if (
    !INGREDIENTS.test(first) &&
    !STEPS.test(first) &&
    first.length <= 120 &&
    !looksLikeIngredient(first)
  ) {
    recipe.title = first
    start = 1
  }
  recipe.title = plainText(sharedTitle, 200) || recipe.title || 'Importiertes Rezept'

  let mode: 'intro' | 'ingredients' | 'steps' = 'intro'
  const intro: string[] = []
  const hasHeadings = lines.some((l) => INGREDIENTS.test(l)) || lines.some((l) => STEPS.test(l))
  let section: string | undefined
  for (const line of lines.slice(start)) {
    if (INGREDIENTS.test(line) && line.length < 60) {
      mode = 'ingredients'
      continue
    }
    if (STEPS.test(line) && line.length < 60) {
      mode = 'steps'
      section = undefined
      continue
    }
    if (isMeta(line)) continue
    if (!hasHeadings && mode !== 'steps') mode = looksLikeIngredient(line) ? 'ingredients' : mode
    if (mode === 'ingredients') {
      // Zwischenüberschriften wie „Für den Teig:“ überspringen
      if (/:$/.test(line) && line.length < 50) continue
      if (!hasHeadings && !looksLikeIngredient(line)) {
        mode = 'steps'
      } else {
        recipe.ingredients.push(line)
        continue
      }
    }
    if (mode === 'steps') {
      if (/:$/.test(line) && line.length < 50 && !/^\d/.test(line)) {
        section = line.replace(/:$/, '')
        continue
      }
      const text = line.replace(/^(schritt\s*)?\d+[.):]\s*/i, '').trim()
      if (text) recipe.steps.push(section ? { section, text } : { text })
      continue
    }
    intro.push(line)
  }
  if (intro.length) recipe.description = intro.join(' ').slice(0, 1000)
  return { recipe, onlyUrl: false }
}
