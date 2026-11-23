// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Google-Projekt in der App eintragen (keine Build-Konfiguration). */

async function setup(page: Page) {
  await page.goto('/')
  await page.getByLabel('Dein Name').fill('Anna')
  await page.getByRole('button', { name: 'Los geht’s' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einkaufslisten')
}

test('Einrichtung zeigt die Adressen dieser Instanz, prüft und speichert die Werte', async ({
  page,
  baseURL,
}) => {
  await setup(page)
  await page.getByRole('link', { name: 'Mit Google verbinden' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mit Google verbinden')
  await page.getByText('So legst du ein Projekt an').click()
  const origin = new URL(baseURL!).origin
  await expect(
    page.locator('code').filter({ hasText: `${origin}/auth/callback.html` }),
  ).toBeVisible()

  await page.getByLabel('OAuth-Client-ID').fill('falsch')
  await page.getByLabel('API-Schlüssel').fill('AIzaE2E-00000000000000000000000000000000')
  await page.getByRole('button', { name: 'Speichern und neu starten' }).click()
  await expect(page.getByText('Erwartet wird eine Client-ID')).toBeVisible()

  await page.getByLabel('OAuth-Client-ID').fill('123456789012-e2etest.apps.googleusercontent.com')
  await page.getByRole('button', { name: 'Speichern und neu starten' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einkaufslisten')
  // Jetzt meldet der Knopf direkt bei Google an statt zur Einrichtung zu führen.
  await expect(page.getByRole('button', { name: 'Mit Google verbinden' })).toBeVisible()

  await page.goto('/#/google')
  await expect(page.getByText('Projekt-Nr. 123456789012')).toBeVisible()
  await page.getByRole('button', { name: 'Entfernen' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einkaufslisten')
  await expect(page.getByRole('link', { name: 'Mit Google verbinden' })).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`Barrierefreiheit Google-Einrichtung (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await setup(page)
    await page.goto('/#/google')
    await page.getByText('So legst du ein Projekt an').click()
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(
      results.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`)),
    ).toEqual([])
    await page.screenshot({ path: `test-results/google-${theme}.png`, fullPage: true })
  })
}
