// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Nährwerte (plan/06-phase-4-import-naehrwerte.md, Teil B) mit den echten BLS-Daten. */

async function setup(page: Page) {
  await page.goto('/')
  await page.getByLabel('Dein Name').fill('Anna')
  await page.getByRole('button', { name: 'Los geht’s' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einkaufslisten')
}

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Hauptmenü' }).getByRole('link', { name }).click()

// Handrechnung mit dem BLS-Auszug: 200 g Mehl Type 405 (348 kcal/100 g) = 696;
// 2 Eier à 55 g (135) = 148,5; 300 ml Vollmilch × 1,03 g/ml (62) = 191,6; Salz 0.
// Summe ≈ 1036 kcal, je Portion ≈ 518 kcal.
const PFANNKUCHEN = `---
title: Pfannkuchen
servings: 2
---
@Mehl{200%g}, @Eier{2}, @Milch{300%ml} und @Salz{1%Prise} verrühren und ausbacken.`

async function createRecipe(page: Page, source: string) {
  await nav(page, 'Rezepte')
  await page.getByRole('button', { name: 'Neues Rezept' }).click()
  await page.getByRole('textbox', { name: 'Rezepttext in Cooklang' }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(source)
  await page.getByRole('button', { name: 'Fertig' }).click()
}

test('Nährwerte in Rezept, Liste und Plan stimmen mit der Handrechnung', async ({ page }) => {
  await setup(page)
  await createRecipe(page, PFANNKUCHEN)

  const section = page.getByRole('region', { name: 'Nährwerte' })
  const kcalRow = section.getByRole('row', { name: /Energie/ })
  await expect(kcalRow).toContainText('≈ 518 kcal')
  await expect(section).toContainText('100 % der Zutaten erfasst')
  await expect(section.getByRole('link', { name: 'CC BY 4.0' })).toBeVisible()
  await expect(section).toContainText('Max Rubner-Institut')

  // Mehr Portionen: Wert je Portion bleibt gleich
  await page.getByRole('button', { name: 'eine Portion mehr' }).click()
  await expect(kcalRow).toContainText('≈ 518 kcal')

  // Rezeptliste: Anzeige, Filter, Sortierung
  await nav(page, 'Rezepte')
  const card = page.getByRole('listitem').filter({ hasText: 'Pfannkuchen' })
  await expect(card).toContainText('≈ 518 kcal/Portion')
  await page.getByLabel('Kalorien').selectOption({ label: 'bis 400 kcal' })
  await expect(page.getByRole('listitem').filter({ hasText: 'Pfannkuchen' })).toHaveCount(0)
  await page.getByLabel('Kalorien').selectOption({ label: 'bis 600 kcal' })
  await expect(card).toBeVisible()

  // Plan: Tagessumme je Person
  await nav(page, 'Plan')
  const today = page.locator('.day--today')
  await today.getByRole('button', { name: /Abendessen am/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Einplanen' })
  await dialog.getByLabel('Rezept', { exact: true }).selectOption({ label: 'Pfannkuchen' })
  await dialog.getByRole('button', { name: 'Einplanen' }).click()
  await expect(today).toContainText('≈ 518 kcal je Person')
  await expect(page.getByText(/^Woche: ≈ 518 kcal je Person/)).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`Barrierefreiheit Nährwerte (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await setup(page)
    await createRecipe(page, PFANNKUCHEN)
    await expect(page.getByRole('region', { name: 'Nährwerte' })).toBeVisible()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      results.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`)),
    ).toEqual([])
    await page
      .getByRole('region', { name: 'Nährwerte' })
      .screenshot({ path: `test-results/nutrition-${theme}.png` })
  })
}
