// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { buildCatalogIndex } from '@tafelritter/rezeptformat/basis'
import { formatAmount } from '@tafelritter/rezeptformat/basis'
import { listIngredients, parseRecipe } from '@tafelritter/rezeptformat'
import { draftCooklang, escapeCooklangText } from './draft'
import { plainText, safeSourceUrl } from './imported-recipe'
import { parseIngredientLine } from './ingredient-line'
import { isoMinutes, recipeFromJsonLd } from './schema-recipe'
import { parseRecipeText } from './text-recipe'

const line = (l: string) => {
  const p = parseIngredientLine(l)
  return [p.quantity, p.unit, p.name, p.note, p.optional]
}

describe('Zutatenzeilen', () => {
  it.each([
    ['500 g Mehl (Type 405)', ['500', 'g', 'Mehl', 'Type 405', false]],
    ['1 ½ EL Olivenöl', ['1.5', 'EL', 'Olivenöl', '', false]],
    ['1 1/2 kg Kartoffeln', ['1.5', 'kg', 'Kartoffeln', '', false]],
    ['1/2 TL Salz', ['0.5', 'TL', 'Salz', '', false]],
    ['½ Bund Petersilie', ['0.5', 'Bund', 'Petersilie', '', false]],
    ['2–3 Zwiebel(n), gewürfelt', ['2-3', '', 'Zwiebel', 'gewürfelt', false]],
    ['2 bis 3 Möhren', ['2-3', '', 'Möhren', '', false]],
    ['3 Essl. Zucker', ['3', 'EL', 'Zucker', '', false]],
    ['2 gestr. EL Speisestärke', ['2', 'EL', 'Speisestärke', '', false]],
    ['1 Pck. Trockenhefe', ['1', 'Pck.', 'Trockenhefe', '', false]],
    ['100 Gramm Käse', ['100', 'g', 'Käse', '', false]],
    ['3 Scheiben Toast', ['3', 'Scheibe', 'Toast', '', false]],
    ['0,5 l Milch', ['0.5', 'l', 'Milch', '', false]],
    ['4 Eier (Größe M)', ['4', '', 'Eier', 'Größe M', false]],
    ['etwas Salz', ['etwas', '', 'Salz', '', false]],
    ['Pfeffer nach Belieben', ['', '', 'Pfeffer', 'nach Belieben', true]],
    ['n. B. Chili', ['', '', 'Chili', 'nach Belieben', true]],
    ['evtl. etwas Milch', ['etwas', '', 'Milch', '', true]],
    ['• 1 Prise Zucker', ['1', 'Prise', 'Zucker', '', false]],
  ])('%s', (input, expected) => {
    expect(line(input)).toEqual(expected)
  })
})

describe('Text aus fremden Seiten', () => {
  it('entfernt Tags, Steuerzeichen und löst Entities auf', () => {
    expect(plainText('<b>Salz</b> &amp; Pfeffer&nbsp;<script>x</script>‮!')).toBe(
      'Salz & Pfeffer x !',
    )
    expect(plainText('A<br>B')).toBe('A\nB')
    expect(plainText(42)).toBe('')
  })

  it('lässt als Quelle nur http(s) ohne Zugangsdaten zu', () => {
    expect(safeSourceUrl('https://a:b@rezepte.example/x#y')).toBe('https://rezepte.example/x')
    expect(safeSourceUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeSourceUrl('data:text/html,x')).toBeUndefined()
  })

  it('entschärft Cooklang-Marken', () => {
    expect(escapeCooklangText('@Mehl{1} #Topf ~{5%min} -- weg [- x -]')).toBe(
      '＠Mehl(1) ＃Topf ～(5%min) – weg [ - x - ]',
    )
    expect(escapeCooklangText('> Notiz')).toBe('› Notiz')
    expect(escapeCooklangText('== Abschnitt ==')).toBe('› Abschnitt ==')
  })
})

const JSON_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', name: 'Seite' },
    {
      '@type': ['Recipe'],
      name: 'Gemüse&shy;pfanne &amp; Reis',
      description: '<p>Schnell gemacht.</p>',
      recipeYield: ['4', '4 Portionen'],
      prepTime: 'PT15M',
      cookTime: 'PT1H5M',
      keywords: 'schnell, vegetarisch',
      recipeCategory: 'Hauptgericht',
      recipeIngredient: [
        '2 Zwiebeln',
        '1 rote Paprika',
        '250 g Reis',
        '2 EL Öl',
        'Salz und Pfeffer',
        'etwas Petersilie',
      ],
      recipeInstructions: [
        {
          '@type': 'HowToSection',
          name: 'Reis',
          itemListElement: [{ '@type': 'HowToStep', text: 'Den Reis nach Packung kochen.' }],
        },
        {
          '@type': 'HowToSection',
          name: 'Gemüse',
          itemListElement: [
            {
              '@type': 'HowToStep',
              text: 'Die Zwiebel würfeln, die Paprika in Streifen schneiden.',
            },
            { '@type': 'HowToStep', text: 'Im Öl 10 Minuten braten, mit Salz würzen.' },
          ],
        },
      ],
    },
  ],
})

describe('schema.org/Recipe', () => {
  it('liest Dauer im ISO-Format', () => {
    expect(isoMinutes('PT1H30M')).toBe(90)
    expect(isoMinutes('P0DT0H20M')).toBe(20)
    expect(isoMinutes('20 Minuten')).toBeUndefined()
  })

  it('findet das Rezept in @graph und liest alle Felder', () => {
    const r = recipeFromJsonLd(['{kaputt', JSON_LD], 'https://rezepte.example/pfanne?x=1')!
    expect(r).toMatchObject({
      title: 'Gemüsepfanne & Reis',
      description: 'Schnell gemacht.',
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 65,
      source: 'https://rezepte.example/pfanne?x=1',
      tags: ['Hauptgericht', 'schnell', 'vegetarisch'],
    })
    expect(r.ingredients).toHaveLength(6)
    expect(r.steps.map((s) => s.section)).toEqual(['Reis', 'Gemüse', 'Gemüse'])
  })

  it('liefert nichts ohne Rezept', () => {
    expect(recipeFromJsonLd(['{"@type":"Article"}'])).toBeUndefined()
  })
})

const catalog = buildCatalogIndex({
  items: [
    { id: 'zwiebeln', name: 'Zwiebeln', category: 'obst-gemuese', synonyms: ['Zwiebel'] },
    { id: 'reis', name: 'Reis', category: 'nudeln-reis-konserven' },
  ],
})

describe('Cooklang-Entwurf', () => {
  it('setzt Zutaten in die Schritte und sammelt den Rest', () => {
    const r = recipeFromJsonLd([JSON_LD])!
    const draft = draftCooklang(r, { importedAt: '2026-11-23', catalog: (n) => catalog.item(n) })
    const parsed = parseRecipe(draft.source)
    expect(parsed.warnings).toEqual([])
    expect(parsed.meta).toMatchObject({
      title: 'Gemüsepfanne & Reis',
      servings: 4,
      cookMinutes: 65,
    })
    expect(draft.source).toContain('imported: 2026-11-23')
    expect(draft.source.match(/^---$/gm)).toHaveLength(2)
    const names = Object.fromEntries(
      listIngredients(parsed).map((i) => [i.name, i.amounts.map(formatAmount).join(' + ')]),
    )
    expect(names).toEqual({
      'rote Paprika': '1',
      'Salz und Pfeffer': '',
      Petersilie: 'etwas',
      Reis: '250 g',
      Zwiebeln: '2',
      Öl: '2 EL',
    })
    expect(draft.ingredients.filter((i) => !i.placed).map((i) => i.name)).toEqual([
      'Salz und Pfeffer',
      'Petersilie',
    ])
    expect(draft.ingredients.find((i) => i.name === 'Zwiebeln')?.catalog?.id).toBe('zwiebeln')
    expect(parsed.sections.map((s) => s.name)).toEqual(['Zutaten', 'Reis', 'Gemüse'])
  })

  it('lässt fremden Text nicht als Cooklang wirken', () => {
    const draft = draftCooklang(
      {
        title: 'X\n---\nsource: javascript:alert(1)',
        ingredients: ['1 @Gift{1}'],
        steps: [{ text: 'Mische @Böses{1} mit ~{1%h} -- Kommentar' }],
        tags: [],
      },
      { importedAt: '2026-11-23' },
    )
    const parsed = parseRecipe(draft.source)
    expect(parsed.meta.source).toBeUndefined()
    expect(parsed.timers).toEqual([])
    expect(listIngredients(parsed).map((i) => i.name)).toEqual(['Gift1'])
    expect(parsed.sections.flatMap((s) => s.blocks)).toHaveLength(2)
  })
})

describe('Text-Import', () => {
  it('erkennt Überschriften, Portionen und Zeiten', () => {
    const { recipe } = parseRecipeText(`Omas Pfannkuchen
Ein einfaches Rezept.
Zutaten für 4 Portionen
Arbeitszeit: ca. 10 Min.
Für den Teig:
250 g Mehl
500 ml Milch
3 Eier
1 Prise Salz
Zubereitung
1. Mehl, Milch und Eier verrühren.
2. Salz dazugeben und kurz ruhen lassen.
3. In der Pfanne ausbacken.
https://rezepte.example/pfannkuchen`)
    expect(recipe).toMatchObject({
      title: 'Omas Pfannkuchen',
      description: 'Ein einfaches Rezept.',
      servings: 4,
      prepMinutes: 10,
      source: 'https://rezepte.example/pfannkuchen',
      ingredients: ['250 g Mehl', '500 ml Milch', '3 Eier', '1 Prise Salz'],
    })
    expect(recipe.steps.map((s) => s.text)).toEqual([
      'Mehl, Milch und Eier verrühren.',
      'Salz dazugeben und kurz ruhen lassen.',
      'In der Pfanne ausbacken.',
    ])
  })

  it('kommt ohne Überschriften aus', () => {
    const { recipe } = parseRecipeText(`Tomatensalat
500 g Tomaten
1 Zwiebel
2 EL Essig
Tomaten und Zwiebel schneiden und mit dem Essig mischen.`)
    expect(recipe.ingredients).toEqual(['500 g Tomaten', '1 Zwiebel', '2 EL Essig'])
    expect(recipe.steps).toHaveLength(1)
    const parsed = parseRecipe(draftCooklang(recipe, { importedAt: '2026-11-23' }).source)
    expect(listIngredients(parsed).map((i) => i.name)).toEqual(['Tomaten', 'Zwiebel', 'Essig'])
  })

  it('erkennt eine geteilte Adresse ohne Text', () => {
    expect(parseRecipeText('', 'Lasagne', 'https://rezepte.example/lasagne')).toMatchObject({
      onlyUrl: true,
      recipe: { title: 'Lasagne', source: 'https://rezepte.example/lasagne' },
    })
    expect(parseRecipeText('https://rezepte.example/x').onlyUrl).toBe(true)
  })
})
