// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Zwei Geräte über einen nachgebildeten Google-Speicher: Einladen, Antwort-Code,
 * gemeinsames Abhaken (plan/03-phase-1-einkaufsliste.md, 1.12).
 *
 * Braucht einen Build mit Google-Konfiguration:
 *   VITE_GOOGLE_CLIENT_ID=e2e VITE_GOOGLE_API_KEY=e2e pnpm build && E2E_GOOGLE=1 pnpm test:e2e
 */

import { expect, test, type Page } from '@playwright/test'
import { FakeGoogle } from './support/fake-google'

test.skip(!process.env.E2E_GOOGLE, 'Build ohne Google-Konfiguration')
test.describe.configure({ timeout: 90_000 })

async function setup(page: Page, name: string) {
  await page.getByLabel('Dein Name').fill(name)
  await page.getByLabel('Name dieses Geräts').fill(`${name}s Gerät`)
  await page.getByRole('button', { name: 'Los geht’s' }).click()
}

async function connect(page: Page) {
  await page.getByRole('button', { name: 'Mit Google verbinden' }).click()
  await expect(page.getByRole('button', { name: 'Mit Google verbinden' })).toHaveCount(0)
}

/** Zeigt einen Code an, sobald die eigene Datei geschrieben ist, und liefert den Link. */
async function showCode(page: Page, button: string): Promise<string> {
  const link = page.locator('.link').first()
  await expect(async () => {
    await page.getByRole('button', { name: button }).click()
    await expect(link).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  return (await link.textContent())!.trim()
}

test('zwei Geräte: einladen, beitreten und gemeinsam abhaken', async ({ browser }) => {
  const google = new FakeGoogle()
  const annaContext = await browser.newContext()
  const benContext = await browser.newContext()
  await google.attach(annaContext, 'anna')
  await google.attach(benContext, 'ben')
  const anna = await annaContext.newPage()
  const ben = await benContext.newPage()

  // Anna richtet sich ein, verbindet Google und legt den Haushalt an.
  await anna.goto('/')
  await setup(anna, 'Anna')
  await connect(anna)
  await anna.getByRole('button', { name: 'Haushalt anlegen' }).click()
  await anna.getByLabel('Name des Haushalts').fill('Familie')
  await anna.getByRole('dialog').getByRole('button', { name: 'Anlegen' }).click()
  const invite = await showCode(anna, 'Einladung anzeigen')
  expect(invite).toContain('#/beitreten/')

  // Ben öffnet die Einladung: erst Einrichtung, dann Beitritt.
  await ben.goto(invite)
  await setup(ben, 'Ben')
  await ben.getByRole('button', { name: 'Beitreten' }).click()
  await expect(ben.getByRole('heading', { name: 'Willkommen in „Familie“' })).toBeVisible()
  // Ben liest bereits ohne Anmeldung; zum Schreiben verbindet er Google.
  await ben.getByRole('button', { name: 'Zu den Listen' }).click()
  await connect(ben)
  await ben.getByRole('link', { name: 'Mitglieder & Einladen' }).first().click()
  const reply = await showCode(ben, 'Eigenen Antwort-Code anzeigen')
  expect(reply).toContain('#/antwort/')

  // Anna nimmt Bens Antwort-Code an.
  await anna.getByLabel('Antwort-Code oder Link').fill(reply)
  await anna.getByRole('button', { name: 'Annehmen' }).click()
  await expect(anna.getByRole('status').filter({ hasText: 'Ben' })).toContainText('ist jetzt dabei')

  // Anna legt eine Liste an; Ben sieht sie und hakt ab.
  await anna.getByRole('link', { name: '← Alle Listen' }).click()
  await anna.getByLabel('Neue Liste in „Familie“').fill('Wocheneinkauf')
  await anna.getByRole('button', { name: 'Anlegen' }).first().click()
  await anna.getByLabel('Was fehlt?').fill('Milch')
  await anna.getByRole('button', { name: 'Hinzufügen' }).click()

  await ben.getByRole('link', { name: '← Alle Listen' }).click()
  await ben.getByRole('link', { name: 'Wocheneinkauf' }).click({ timeout: 30_000 })
  const benMilk = ben.getByRole('checkbox', { name: 'Milch' })
  await expect(benMilk).toBeVisible({ timeout: 15_000 })
  await benMilk.check()

  // Anna sieht das Abhaken nach wenigen Sekunden (Abfrage alle 3 s in der Listenansicht).
  await expect(anna.getByRole('checkbox', { name: 'Milch' })).toBeChecked({ timeout: 15_000 })

  // Die Dateien in Drive sind ohne Schlüssel nicht lesbar.
  for (const file of google.files.values()) {
    const text = file.content.toString('utf8')
    expect(text).not.toContain('Milch')
    expect(text).not.toContain('Familie')
  }

  await annaContext.close()
  await benContext.close()
})
