// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { parseRecipe } from '@tafelritter/rezeptformat'
import { type SearchableRecipe, allTags, createRecipeSearch } from './search'

const item = (
  key: string,
  src: string,
  extra: Partial<SearchableRecipe> = {},
): SearchableRecipe => ({
  key,
  recipe: parseRecipe(src),
  createdAt: 0,
  ...extra,
})

const items = [
  item(
    'kuchen',
    '---\ntitle: Käsekuchen\ntags: [Kuchen, Backen]\ntime.prep: 30 min\ntime.cook: 60 min\n---\nRühre @Quark{500%g} mit @Eiern{3}.',
    {
      diet: 'vegetarisch',
      stars: 5,
      lastCooked: 100,
      createdAt: 1,
      collections: ['sonntag'],
    },
  ),
  item(
    'salat',
    '---\ntitle: Rucolasalat\ntags: [Salat, schnell]\ntime.prep: 10 min\n---\nMische @Rucola{100%g} mit @Olivenöl{2%EL}.',
    {
      diet: 'vegan',
      stars: 3,
      lastCooked: 300,
      createdAt: 3,
    },
  ),
  item(
    'gulasch',
    '---\ntitle: Gulasch\ntags: [Eintopf]\ntime.cook: 2 h\n---\nSchmore @Rindfleisch{1%kg} mit @Zwiebeln{500%g}.',
    {
      diet: 'omnivor',
      createdAt: 2,
    },
  ),
]

describe('Rezeptsuche', () => {
  const search = createRecipeSearch(items)
  const keys = (r: SearchableRecipe[]) => r.map((i) => i.key)

  it('findet über Titel, Zutaten und Text, auch mit Präfix, ohne Umlaut und mit Tippfehler', () => {
    expect(keys(search({ query: 'Käse' }))).toEqual(['kuchen'])
    expect(keys(search({ query: 'kase' }))).toEqual(['kuchen'])
    expect(keys(search({ query: 'rucol' }))).toEqual(['salat'])
    expect(keys(search({ query: 'Zwiebeln' }))).toEqual(['gulasch'])
    expect(keys(search({ query: 'schmore' }))).toEqual(['gulasch'])
    expect(keys(search({ query: 'Gulasc' }))).toEqual(['gulasch'])
    expect(keys(search({ query: 'Gulsch' }))).toEqual(['gulasch'])
    expect(keys(search({ query: 'Pizza' }))).toEqual([])
  })

  it('filtert nach Tags, Ernährungsform, Zeit und Sammlung', () => {
    expect(keys(search({ tags: ['kuchen'] }))).toEqual(['kuchen'])
    expect(keys(search({ diet: 'vegetarisch' }))).toEqual(['kuchen', 'salat'])
    expect(keys(search({ diet: 'vegan' }))).toEqual(['salat'])
    expect(keys(search({ maxMinutes: 30 }))).toEqual(['salat'])
    expect(keys(search({ collection: 'sonntag' }))).toEqual(['kuchen'])
  })

  it('sortiert nach Name, Bewertung, zuletzt gekocht, Zeit und Neuheit', () => {
    expect(keys(search({}, 'name'))).toEqual(['gulasch', 'kuchen', 'salat'])
    expect(keys(search({}, 'rating'))).toEqual(['kuchen', 'salat', 'gulasch'])
    expect(keys(search({}, 'cooked'))).toEqual(['salat', 'kuchen', 'gulasch'])
    expect(keys(search({}, 'time'))).toEqual(['salat', 'kuchen', 'gulasch'])
    expect(keys(search({}, 'newest'))).toEqual(['salat', 'gulasch', 'kuchen'])
  })

  it('zählt Tags', () => {
    expect(allTags(items).map((t) => t.tag)).toEqual([
      'Backen',
      'Eintopf',
      'Kuchen',
      'Salat',
      'schnell',
    ])
  })
})

describe('Kalorien', () => {
  const list = [
    item('a', '---\ntitle: Salat\n---\nx', { kcal: 250 }),
    item('b', '---\ntitle: Auflauf\n---\nx', { kcal: 780 }),
    item('c', '---\ntitle: Brot\n---\nx'),
  ]
  const search = createRecipeSearch(list)
  it('sortiert nach kcal je Portion, ohne Werte am Ende', () => {
    expect(search({}, 'kcal').map((r) => r.key)).toEqual(['a', 'b', 'c'])
  })
  it('filtert nach Obergrenze und lässt Rezepte ohne Werte weg', () => {
    expect(search({ maxKcal: 600 }).map((r) => r.key)).toEqual(['a'])
  })
})
