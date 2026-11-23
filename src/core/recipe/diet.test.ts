// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import type { Diet } from '@tafelritter/rezeptformat/basis'
import { matchesDiet, recipeDiet } from './diet'
import { parseRecipe } from '@tafelritter/rezeptformat'
import type { RecipeIndex } from '@tafelritter/rezeptformat'

const DIETS: Record<string, Diet> = {
  mehl: 'vegan',
  wasser: 'vegan',
  zwetschgen: 'vegan',
  butter: 'vegetarisch',
  speck: 'omnivor',
  lachs: 'pescetarisch',
}
const lookup = (n: string) => DIETS[n]

const teig = (butter: boolean) =>
  parseRecipe(
    `---\ntitle: Teig\nyield: 500 g\n---\n@Mehl{300%g} @Wasser{200%ml}${butter ? ' @Butter{20%g}' : ''}`,
  )

describe('Ernährungsform', () => {
  it('erbt die Stufe der Zutaten, auch über Referenzen', () => {
    const kuchen = parseRecipe('---\ntitle: Kuchen\n---\n@./Teig{500%g} @Zwetschgen{1%kg}')
    const vegan: RecipeIndex = { entries: [{ key: 't', scope: 'a', recipe: teig(false) }] }
    const withButter: RecipeIndex = { entries: [{ key: 't', scope: 'a', recipe: teig(true) }] }
    expect(recipeDiet(vegan, kuchen, 'a', lookup)).toEqual({
      diet: 'vegan',
      unknown: [],
      overridden: false,
    })
    expect(recipeDiet(withButter, kuchen, 'a', lookup).diet).toBe('vegetarisch')
    expect(matchesDiet('vegetarisch', 'vegan')).toBe(false)
    expect(matchesDiet('vegan', 'vegetarisch')).toBe(true)
  })

  it('nimmt die am wenigsten einschränkende Stufe', () => {
    const r = parseRecipe('---\ntitle: X\n---\n@Lachs{} @Speck{} @Butter{}')
    expect(recipeDiet({ entries: [] }, r, 'a', lookup).diet).toBe('omnivor')
  })

  it('markiert unbekannte Zutaten und fehlende Referenzen', () => {
    const r = parseRecipe('---\ntitle: X\n---\n@Mehl{} @Drachenfrucht{} @./Fehlt{1}')
    expect(recipeDiet({ entries: [] }, r, 'a', lookup)).toEqual({
      diet: 'vegan',
      unknown: ['Drachenfrucht', 'Fehlt'],
      overridden: false,
    })
  })

  it('lässt sich manuell überschreiben', () => {
    const r = parseRecipe('---\ntitle: X\ndiet: vegan\n---\n@Butter{}')
    expect(recipeDiet({ entries: [] }, r, 'a', lookup)).toEqual({
      diet: 'vegan',
      unknown: [],
      overridden: true,
    })
  })
})
