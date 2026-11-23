// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function setup(page: Page) {
  await page.goto('/')
  await page.getByLabel('Dein Name').fill('Anna')
  await page.getByLabel('Name dieses Geräts').fill('Laptop')
  await page.getByRole('button', { name: 'Los geht’s' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einkaufslisten')
}

async function newList(page: Page, name: string) {
  await page
    .getByLabel(/Neue Liste in/)
    .first()
    .fill(name)
  await page.getByRole('button', { name: 'Anlegen' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
}

async function addItem(page: Page, name: string, quantity = '', unit = '') {
  await page.getByLabel('Was fehlt?').fill(name)
  await page.getByLabel('Menge', { exact: true }).fill(quantity)
  await page.getByLabel('Einheit', { exact: true }).fill(unit)
  await page.getByRole('button', { name: 'Hinzufügen' }).click()
}

test('Einrichtung führt zum persönlichen Bereich', async ({ page }) => {
  await setup(page)
  await expect(page.getByRole('heading', { level: 2, name: 'Persönlich' })).toBeVisible()
})

test('Listenansicht läuft auf schmalen Bildschirmen nicht seitlich über', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await setup(page)
  await newList(page, 'Wocheneinkauf')
  await addItem(page, 'Ein ziemlich langer Artikelname für den Test', '500', 'Gramm')
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

test('Einkaufsliste: hinzufügen, abhaken, Erledigte entfernen, Rückgängig, offline gespeichert', async ({
  page,
}) => {
  await setup(page)
  await newList(page, 'Wocheneinkauf')
  await addItem(page, 'Milch', '2', 'l')
  await addItem(page, 'Brot')
  const milk = page.getByRole('checkbox', { name: /Milch/ })
  await milk.check()
  await expect(milk).toBeChecked()

  await page.getByRole('button', { name: 'Erledigte entfernen' }).click()
  await expect(page.getByRole('checkbox', { name: /Milch/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Rückgängig' }).click()
  await expect(page.getByRole('checkbox', { name: /Milch/ })).toBeChecked()

  // Lokal gespeichert: übersteht Neuladen
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Brot/ })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Milch/ })).toBeChecked()
})

test('Doppelte Einträge zusammenführen und Kategorie merken', async ({ page }) => {
  await setup(page)
  await newList(page, 'Liste')
  await addItem(page, 'Äpfel', '2')
  await addItem(page, 'äpfel', '3')
  await page.getByRole('button', { name: 'Zusammenführen' }).click()
  await expect(page.getByRole('checkbox', { name: /Äpfel/ })).toHaveCount(1)
  await expect(page.getByText('5', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Ändern\s*:\s*Äpfel/ }).click()
  await page.getByLabel('Kategorie').selectOption({ label: 'Obst & Gemüse' })
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Obst & Gemüse' })).toBeVisible()

  await page.getByRole('button', { name: /Ändern\s*:\s*Äpfel/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Löschen' }).click()
  await addItem(page, 'Äpfel')
  await expect(page.getByRole('heading', { level: 2, name: 'Obst & Gemüse' })).toBeVisible()
})

test('Katalog ordnet bekannte Artikel ein und schlägt Namen vor', async ({ page }) => {
  await setup(page)
  await newList(page, 'Liste')
  await addItem(page, 'Apfel')
  await addItem(page, 'Klopapier')
  await addItem(page, 'Etwas Unbekanntes')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Obst & Gemüse',
    'Drogerie & Haushalt',
    'Sonstiges',
  ])
  await expect(page.locator('datalist option[value="Zahnpasta"]')).toHaveCount(1)
})

test('Laden mit eigener Reihenfolge sortiert die Liste', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Haushalt anlegen' }).click()
  await page.getByLabel('Name des Haushalts').fill('Familie')
  await page.getByRole('dialog').getByRole('button', { name: 'Anlegen' }).click()
  await page.getByLabel('Neuer Laden').fill('Getränkemarkt')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  const up = page.getByRole('button', { name: 'Getränke nach oben' })
  for (let i = 0; i < 12; i++) if (await up.isEnabled()) await up.click()
  await expect(up).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'Position 1' })).toHaveCount(1)

  await page.getByRole('link', { name: '← Alle Listen' }).click()
  await page.getByLabel('Neue Liste in „Familie“').fill('Einkauf')
  await page.getByRole('button', { name: 'Anlegen' }).first().click()
  await addItem(page, 'Äpfel')
  await addItem(page, 'Wasser')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Obst & Gemüse', 'Getränke'])
  await page.getByLabel('Sortiert für').selectOption({ label: 'Getränkemarkt' })
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Getränke', 'Obst & Gemüse'])
})

test('Hinweis auf den Wiederherstellungscode verschwindet, sobald er angezeigt wurde', async ({
  page,
}) => {
  await setup(page)
  await newList(page, 'Liste')
  await page.getByRole('link', { name: '← Alle Listen' }).click()
  const hint = page.getByText('Ohne ihn sind die Daten verloren')
  await expect(hint).toBeVisible()
  await page.getByRole('link', { name: 'Wiederherstellungscode' }).click()
  await page.getByRole('button', { name: 'Wiederherstellungscode anzeigen' }).click()
  await page.getByRole('link', { name: '← Alle Listen' }).click()
  await expect(hint).toHaveCount(0)
})

test('Liste mit anderen teilen bekommt einen eigenen Bereich', async ({ page }) => {
  await setup(page)
  await newList(page, 'Grillfest')
  await addItem(page, 'Kohle')
  await page.getByRole('button', { name: 'Mit anderen teilen' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Teilen' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grillfest')
  await expect(page.getByRole('heading', { name: 'Jemanden einladen' })).toBeVisible()
  await page.getByRole('link', { name: '← Alle Listen' }).click()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Grillfest', 'Persönlich'])
  await page.getByRole('link', { name: 'Grillfest' }).click()
  await expect(page.getByRole('checkbox', { name: 'Kohle' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mit anderen teilen' })).toHaveCount(0)
})

test('Haushalt anlegen; Einladung braucht einen verbundenen Speicher', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Haushalt anlegen' }).click()
  await page.getByLabel('Name des Haushalts').fill('Familie')
  await page.getByRole('dialog').getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Familie')
  await expect(page.getByText('Anna · Laptop')).toBeVisible()
  await page.getByRole('button', { name: 'Einladung anzeigen' }).click()
  await expect(page.getByRole('alert')).toContainText('mit dem Speicher verbinden')

  await page.getByRole('button', { name: 'Wiederherstellungscode anzeigen' }).click()
  await expect(page.getByRole('img', { name: /Wiederherstellungscode/ })).toBeVisible()
})

test('Ungültige Einladung wird abgewiesen, ohne Einrichtung zu verlieren', async ({ page }) => {
  await setup(page)
  await page.goto('/#/beitreten/kaputt')
  await expect(page.getByRole('alert')).toContainText('ungültig')
})

for (const theme of ['light', 'dark'] as const) {
  test(`Barrierefreiheit der Listenansicht (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await setup(page)
    await newList(page, 'Liste')
    await addItem(page, 'Milch', '1', 'l')
    await page.getByRole('checkbox', { name: /Milch/ }).check()
    await addItem(page, 'Brot')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      results.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`)),
    ).toEqual([])
  })
}
