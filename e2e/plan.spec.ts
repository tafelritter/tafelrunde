// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Wochenplan und Einkaufsliste aus Rezepten (plan/05-phase-3-planung.md). */

function collectProblems(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') problems.push(msg.text())
  })
  page.on('pageerror', (err) => problems.push(err.message))
  return problems
}

async function setup(page: Page) {
  await page.goto('/')
  await page.getByLabel('Dein Name').fill('Anna')
  await page.getByRole('button', { name: 'Los geht’s' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einkaufslisten')
}

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Hauptmenü' }).getByRole('link', { name }).click()

async function createRecipe(page: Page, source: string) {
  await nav(page, 'Rezepte')
  await page.getByRole('button', { name: 'Neues Rezept' }).click()
  const editor = page.getByRole('textbox', { name: 'Rezepttext in Cooklang' })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(source)
  await page.getByRole('button', { name: 'Fertig' }).click()
}

const HEFETEIG = `---
title: Hefeteig
yield: 800 g
---
Verknete @Mehl{500%g}, @Milch{250%ml}, @Butter{50%g} und @Salz{1%Prise}.`

const PIZZA = `---
title: Pizza
servings: 4
---
Belege @./Hefeteig{400%g} mit @Tomaten{4} und @Zwiebel{1}.`

const ZWIEBELKUCHEN = `---
title: Zwiebelkuchen
servings: 4
---
Belege @./Hefeteig{800%g} mit @Zwiebeln{1%kg} und @Eier{3}.`

async function planToday(page: Page, title: string) {
  await nav(page, 'Plan')
  const today = page.locator('.day--today')
  await today.getByRole('button', { name: /Abendessen am/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Einplanen' })
  await dialog.getByLabel('Rezept suchen').fill(title)
  await dialog.getByLabel('Rezept', { exact: true }).selectOption({ label: title })
  await dialog.getByRole('button', { name: 'Einplanen' }).click()
  await expect(today).toContainText(title)
}

test('Woche planen, Liste erzeugen, einkaufen, kochen', async ({ page }) => {
  const problems = collectProblems(page)
  await setup(page)
  for (const r of [HEFETEIG, PIZZA, ZWIEBELKUCHEN]) await createRecipe(page, r)

  // Grundvorrat festlegen
  await nav(page, 'Plan')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wochenplan')
  await page.getByText('Mahlzeiten und Grundvorräte').click()
  await page.getByLabel('Grundvorrat hinzufügen').fill('Salz')
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).last().click()
  await expect(page.locator('.chips')).toContainText('Salz')

  // Pizza aus der Rezeptansicht einplanen (8 Portionen), Zwiebelkuchen in der Woche
  await nav(page, 'Rezepte')
  await page.getByRole('link', { name: 'Pizza' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'eine Portion mehr' }).click()
  await page.getByRole('button', { name: 'Einplanen' }).click()
  await page
    .getByRole('dialog', { name: 'Einplanen' })
    .getByRole('button', { name: 'Einplanen' })
    .click()
  await expect(page.getByText(/Eingeplant am/)).toBeVisible()
  await planToday(page, 'Zwiebelkuchen')
  const today = page.locator('.day--today')
  await expect(today).toContainText('Pizza')
  await expect(today).toContainText('8 P.')
  await expect(today.getByText('Heute kochen')).toHaveCount(2)

  // Einkaufsliste aus dem Plan
  await page.getByRole('button', { name: 'Einkaufsliste erstellen' }).click()
  await expect(page.getByText('2 Rezepte geplant.')).toBeVisible()
  await page.getByRole('button', { name: 'Weiter' }).click()
  const preview = page.getByRole('dialog', { name: 'Einkaufsliste aus dem Plan' })
  await expect(preview.getByText('„Hefeteig“ schon vorhanden?')).toBeVisible()
  await expect(preview.getByText('für: Pizza, Zwiebelkuchen').first()).toBeVisible()
  // Salz ist Grundvorrat und nicht ausgewählt
  await expect(preview.getByRole('checkbox', { name: 'Salz' })).not.toBeChecked()
  await expect(preview.getByRole('checkbox', { name: 'Mehl' })).toBeChecked()
  // 2 × 800 g Teig → 1 kg Mehl
  await expect(preview.getByLabel('Menge Mehl')).toHaveValue('1')
  await expect(preview.getByLabel('Einheit Mehl')).toHaveValue('kg')
  await page.screenshot({ path: 'test-results/plan-preview.png' })
  await preview.getByRole('button', { name: /übernehmen/ }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einkauf')
  const zwiebeln = page.locator('li', { hasText: 'Zwiebeln' })
  await expect(zwiebeln).toContainText('für: Pizza, Zwiebelkuchen')
  await expect(zwiebeln).toContainText('2 + 1 kg')
  await expect(page.getByRole('heading', { name: 'Obst & Gemüse' })).toBeVisible()
  await expect(page.locator('li', { hasText: 'Salz' })).toHaveCount(0)
  await page.getByRole('checkbox', { name: /^Eier/ }).check()

  // Pizza aus dem Plan nehmen → offene Einträge passen sich an
  await nav(page, 'Plan')
  await page.getByRole('button', { name: /Ändern\s*:\s*Pizza/ }).click()
  await page
    .getByRole('dialog', { name: 'Planeintrag' })
    .getByRole('button', { name: 'Entfernen' })
    .click()
  const adjust = page.getByRole('dialog', { name: 'Einkaufsliste anpassen?' })
  await expect(adjust).toContainText('Tomaten: 8 → entfernen')
  await adjust.getByRole('button', { name: 'Liste anpassen' }).click()
  await expect(page.locator('.day--today')).not.toContainText('Pizza')

  // Zwiebelkuchen kochen: Koch-Protokoll und Bewertung
  await page.getByRole('button', { name: /Ändern\s*:\s*Zwiebelkuchen/ }).click()
  await page
    .getByRole('dialog', { name: 'Planeintrag' })
    .getByRole('button', { name: 'Gekocht' })
    .click()
  await page.getByRole('button', { name: '4 von 5 Sternen' }).click()
  await expect(page.locator('.day--today')).toContainText('gekocht')
  await page.locator('.day--today').getByRole('link', { name: 'Zwiebelkuchen' }).click()
  await expect(page.getByText(/Zuletzt gekocht am/)).toBeVisible()

  await nav(page, 'Einkauf')
  await page.getByRole('link', { name: 'Einkauf' }).last().click()
  await expect(page.locator('li', { hasText: 'Tomaten' })).toHaveCount(0)
  await expect(page.locator('li', { hasText: 'Zwiebeln' })).toContainText('1 kg')
  await expect(page.locator('li', { hasText: 'Mehl' })).toContainText('500 g')
  // Abgehakte Einträge bleiben unverändert
  await expect(page.getByRole('checkbox', { name: /^Eier/ })).toBeChecked()

  expect(problems).toEqual([])
})

test('Rezept direkt auf die Einkaufsliste, Unterrezept als ein Posten', async ({ page }) => {
  await setup(page)
  for (const r of [HEFETEIG, PIZZA]) await createRecipe(page, r)
  await page.getByRole('button', { name: 'Auf die Einkaufsliste' }).click()
  const preview = page.getByRole('dialog', { name: 'Auf die Einkaufsliste' })
  await preview.getByLabel('Als einen Posten übernehmen').check()
  await expect(preview.getByRole('checkbox', { name: 'Mehl' })).toHaveCount(0)
  await expect(preview.getByLabel('Menge Hefeteig')).toHaveValue('400')
  await preview.getByRole('checkbox', { name: 'Tomaten' }).uncheck()
  await preview.getByLabel('Menge Zwiebeln').fill('2')
  await preview.getByRole('button', { name: '2 übernehmen' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einkauf')
  await expect(page.locator('li', { hasText: 'Hefeteig' })).toContainText('400 g')
  await expect(page.locator('li', { hasText: 'Zwiebeln' })).toContainText('2')
  await expect(page.locator('li', { hasText: 'Tomaten' })).toHaveCount(0)
})

test('Planeintrag per Dialog verschieben und per Drag & Drop in den Ideen-Pool', async ({
  page,
  isMobile,
}) => {
  await setup(page)
  await createRecipe(page, PIZZA)
  await planToday(page, 'Pizza')
  await page.getByRole('button', { name: /Ändern\s*:\s*Pizza/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Planeintrag' })
  await dialog.getByLabel('Tag').fill('')
  await dialog.getByRole('button', { name: 'Speichern' }).click()
  const ideas = page.locator('.ideas')
  await expect(ideas).toContainText('Pizza')
  await expect(page.locator('.day--today')).not.toContainText('Pizza')
  test.skip(isMobile, 'Drag & Drop nur am Desktop')
  await ideas.locator('.entry', { hasText: 'Pizza' }).dragTo(page.locator('.day--today .slot'))
  await expect(page.locator('.day--today')).toContainText('Pizza')
  await expect(ideas).not.toContainText('Pizza')
})

for (const theme of ['light', 'dark'] as const) {
  test(`Barrierefreiheit Wochenplan (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await setup(page)
    await createRecipe(page, PIZZA)
    await planToday(page, 'Pizza')
    await page.getByText('Mahlzeiten und Grundvorräte').click()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      results.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`)),
    ).toEqual([])
    await page.screenshot({ path: `test-results/plan-${theme}.png`, fullPage: true })
  })
}
