// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { normalizeName } from '@tafelritter/rezeptformat/basis'
import { parseRecipe } from '@tafelritter/rezeptformat'
import type { RecipeIndex } from '@tafelritter/rezeptformat'
import { buildNutritionData, gramsOf, recipeNutrition, unitKey } from './nutrition'

// Testwerte je 100 g: kcal, kJ, Fett, ges. FS, KH, Zucker, Ballaststoffe, Eiweiß, Salz
const data = buildNutritionData({
  foods: {
    mehl: { n: [350, 1470, 1, 0.2, 72, 0.7, 4, 10, 0] },
    milch: { n: [64, 268, 3.5, 2.2, 4.8, 4.8, 0, 3.3, 0.1], d: 1.03 },
    butter: { n: [740, 3100, 83, 52, 0.6, 0.6, 0, 0.7, 0.03], w: { el: 12 } },
    zucker: { n: [400, 1700, 0, 0, 100, 100, 0, 0, 0] },
    eier: { n: [137, 570, 9.3, 2.7, 0.6, 0.6, 0, 12.5, 0.36], w: { stueck: 60 } },
    zwetschgen: { n: [47, 197, 0.1, 0, 10, 10, 1.6, 0.6, 0] },
    kaputt: { n: [1, 2, 3] },
    sirup: { n: [260, 1100, 0, 0, 67, 60, null, 0, 0] },
  },
  units: { el: { ml: 15 }, tl: { ml: 5 }, prise: { g: 0.4 }, boese: { ml: -1 } },
})
const ids: Record<string, string> = {
  mehl: 'mehl',
  milch: 'milch',
  butter: 'butter',
  zucker: 'zucker',
  eier: 'eier',
  ei: 'eier',
  zwetschgen: 'zwetschgen',
}
const lookupId = (n: string) => ids[n]

const TEIG = `---
title: Teig
yield: 1 kg
---
@Mehl{500%g}, @Milch{250%ml}, @Butter{2%EL}, @Zucker{50%g} und @Ei{2} verkneten. @Salz{} dazu.`

const KUCHEN = `---
title: Kuchen
servings: 10
---
@./Teig{500%g} ausrollen, mit @Zwetschgen{1%kg} und @?Zimt{1%TL} belegen, @Zucker{2%EL} darüber.`

const index: RecipeIndex = {
  entries: [
    { key: 'space:a/t', scope: 'a', recipe: parseRecipe(TEIG) },
    { key: 'space:a/k', scope: 'a', recipe: parseRecipe(KUCHEN) },
  ],
}

describe('Einheiten in Gramm', () => {
  const milch = data.food('milch')!
  const butter = data.food('butter')!
  const eier = data.food('eier')!
  const n = (value: number, unit: string) => ({
    kind: 'number' as const,
    value,
    unit,
    scalable: true,
  })
  it('rechnet Masse, Volumen mit Dichte, eigene und allgemeine Einheiten', () => {
    expect(gramsOf(n(1, 'kg'), milch, data)).toBe(1000)
    expect(gramsOf(n(0.5, 'l'), milch, data)).toBeCloseTo(515)
    expect(gramsOf(n(2, 'EL'), butter, data)).toBe(24) // eigenes Gewicht
    expect(gramsOf(n(2, 'EL'), milch, data)).toBeCloseTo(30.9) // 15 ml × 1,03
    expect(gramsOf(n(3, ''), eier, data)).toBe(180)
    expect(gramsOf(n(3, 'Stück'), eier, data)).toBe(180)
    expect(gramsOf(n(1, 'Bund'), eier, data)).toBeUndefined()
    expect(gramsOf({ kind: 'text', text: 'etwas', unit: '' }, eier, data)).toBeUndefined()
  })
  it('liest Einheiten-Schlüssel', () => {
    expect(['Stück', 'Stk.', '', 'EL', 'Pck.', 'Zehen', 'Würfel'].map(unitKey)).toEqual([
      'stueck',
      'stueck',
      'stueck',
      'el',
      'pck',
      'zehe',
      'wuerfel',
    ])
  })
  it('verwirft ungültige Einträge', () => {
    expect(data.food('kaputt')).toBeUndefined()
    expect(data.unit('boese')).toBeUndefined()
    expect(buildNutritionData(null).size).toBe(0)
  })
})

describe('Nährwerte eines Rezepts mit Unterrezept', () => {
  it('stimmt mit der Handrechnung überein', () => {
    const r = recipeNutrition(index, index.entries[1]!.recipe, 'a', data, lookupId)
    // Handrechnung: 500 g Teig = Hälfte von 1 kg Ausbeute → Faktor 0,5
    //   Mehl 250 g → 875 kcal; Milch 125 ml × 1,03 = 128,75 g → 82,4 kcal
    //   Butter 1 EL = 12 g → 88,8 kcal; Zucker 25 g → 100 kcal; Ei 1 × 60 g → 82,2 kcal
    // Kuchen: Zwetschgen 1000 g → 470 kcal; Zucker 2 EL = 30 ml × 1,0 = 30 g → 120 kcal
    const hand = 875 + 82.4 + 88.8 + 100 + 82.2 + 470 + 120
    expect(r.total.kcal).toBeGreaterThan(hand * 0.95)
    expect(r.total.kcal).toBeLessThan(hand * 1.05)
    expect(r.total.kcal).toBeCloseTo(hand, 0)
    expect(r.perServing!.kcal).toBeCloseTo(hand / 10, 1)
    expect(r.servings).toBe(10)
    // Optionaler Zimt bleibt außen vor, Salz ohne Menge zählt nicht zur Abdeckung
    expect(r.withoutAmount).toEqual(['Salz'])
    expect(r.missing).toEqual([])
    expect(r.coverage).toBe(1)
  })

  it('skaliert mit den gewählten Portionen', () => {
    const one = recipeNutrition(index, index.entries[1]!.recipe, 'a', data, lookupId)
    const two = recipeNutrition(index, index.entries[1]!.recipe, 'a', data, lookupId, 2)
    expect(two.total.kcal).toBeCloseTo(one.total.kcal * 2)
    expect(two.perServing!.kcal).toBeCloseTo(one.perServing!.kcal)
  })

  it('zeigt fehlende Zutaten in der Abdeckung', () => {
    const recipe = parseRecipe('---\ntitle: X\n---\n@Mehl{100%g}, @Safran{1%g}, @Eier{1%Bund}.')
    const r = recipeNutrition({ entries: [] }, recipe, 'a', data, (n) => ids[normalizeName(n)])
    expect(r.missing).toEqual(['Safran', 'Eier'])
    expect(r.coverage).toBeCloseTo(1 / 3)
    expect(r.total.kcal).toBeCloseTo(350)
    expect(r.perServing).toBeUndefined()
  })

  it('zählt fehlende Werte nicht als 0, sondern meldet sie', () => {
    const recipe = parseRecipe('---\ntitle: X\n---\n@Mehl{100%g} mit @Sirup{100%g}.')
    const r = recipeNutrition({ entries: [] }, recipe, 'a', data, (n) =>
      n === 'sirup' ? 'sirup' : ids[n],
    )
    expect(r.total.ballaststoffe).toBeCloseTo(4)
    expect(r.incomplete).toEqual(['ballaststoffe'])
    expect(r.total.kcal).toBeCloseTo(610)
  })
})
