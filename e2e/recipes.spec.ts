// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

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

/** Legt ein Rezept an und ersetzt den Text im Editor. */
async function createRecipe(page: Page, source: string) {
  await page
    .getByRole('navigation', { name: 'Hauptmenü' })
    .getByRole('link', { name: 'Rezepte' })
    .click()
  await page.getByRole('button', { name: 'Neues Rezept' }).click()
  const editor = page.getByRole('textbox', { name: 'Rezepttext in Cooklang' })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.insertText(source)
  return editor
}

const HEFETEIG = `---
title: Hefeteig
yield: 800 g
---
Verknete @Mehl{500%g}, @Milch{250%ml} und @Butter{50%g}. Lass ihn ~Gehen{1%h} ruhen.`

const KUCHEN = `---
title: Zwetschgenkuchen
servings: 12
---
== Teig ==
Rolle @./Hefeteig{400%g} aus.

== Belag ==
Belege mit @Zwetschgen{1,5%kg} und @Zimt{=1%Prise}. Backe ~{40%Minuten}.`

test('Rezept anlegen, ansehen, skalieren und kochen – ohne CSP-Verstöße', async ({ page }) => {
  const problems = collectProblems(page)
  await setup(page)
  await createRecipe(page, HEFETEIG)
  await page.getByRole('button', { name: 'Fertig' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hefeteig')
  await expect(page.getByText('ergibt 800 g')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Zutaten' })).toBeVisible()
  await expect(page.locator('.ingredients')).toContainText('500 g')
  await expect(page.getByText('vegetarisch')).toBeVisible()

  // Timer starten und anhalten
  const timer = page.getByRole('button', { name: /1 h – Timer starten/ })
  await timer.click()
  await expect(page.getByRole('button', { name: /Timer anhalten/ })).toBeVisible()
  await page.getByRole('button', { name: /Timer anhalten/ }).click()

  // Kochmodus
  await page.getByRole('button', { name: 'Kochmodus' }).click()
  const cook = page.getByRole('dialog', { name: 'Hefeteig' })
  await expect(cook).toContainText('Schritt 1 von 1')
  await expect(cook).toContainText('500 g Mehl')
  await cook.getByRole('button', { name: 'Schließen' }).click()

  await page.getByRole('button', { name: 'Heute gekocht' }).click()
  await expect(page.getByText(/Zuletzt gekocht am/)).toBeVisible()

  expect(problems).toEqual([])
})

test('Referenz auf ein Unterrezept skaliert nach Ausbeute; Zyklus wird gemeldet', async ({
  page,
}) => {
  await setup(page)
  await createRecipe(page, HEFETEIG)
  await page.getByRole('button', { name: 'Fertig' }).click()
  await createRecipe(page, KUCHEN)
  await page.getByRole('button', { name: 'Fertig' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zwetschgenkuchen')
  // 400 g von 800 g Hefeteig = halbe Menge
  await page.locator('summary', { hasText: 'Hefeteig' }).click()
  await expect(page.locator('.ingredients details')).toContainText('250 g Mehl')
  // Doppelte Portionen: alles doppelt, die Prise nicht
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'eine Portion mehr' }).click()
  await expect(page.getByText('24 Portionen')).toBeVisible()
  await expect(page.locator('.ingredients')).toContainText('3 kg')
  await expect(page.locator('.ingredients')).toContainText('1 Prise')
  await expect(page.locator('.ingredients details')).toContainText('500 g Mehl')

  // Link zum Unterrezept im Text
  await page.locator('.steps').getByRole('link', { name: 'Hefeteig' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hefeteig')

  // Hefeteig auf den Kuchen verweisen lassen → Zyklus
  await page.getByRole('link', { name: 'Bearbeiten' }).click()
  const editor = page.getByRole('textbox', { name: 'Rezepttext in Cooklang' })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.insertText(' Dazu @./Zwetschgenkuchen{1}.')
  await expect(page.getByText('Zyklus: Hefeteig → Zwetschgenkuchen → Hefeteig')).toBeVisible()
  await page.getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByRole('alert')).toContainText('im Kreis')
})

test('Einfügehilfen und Metadaten-Formular schreiben Cooklang', async ({ page }) => {
  await setup(page)
  await createRecipe(page, '---\ntitle: Salat\n---\nMische ')
  await page.keyboard.press('ControlOrMeta+End')
  await page.getByRole('button', { name: 'Zutat einfügen' }).click()
  const dialog = page.getByRole('dialog', { name: 'Zutat einfügen' })
  await dialog.getByLabel('Zutat').fill('Rucola')
  await dialog.getByLabel('Menge', { exact: true }).fill('100')
  await dialog.getByLabel('Einheit').fill('g')
  await dialog.getByRole('button', { name: 'Einfügen' }).click()
  await expect(page.getByRole('textbox', { name: 'Rezepttext in Cooklang' })).toContainText(
    'Mische @Rucola{100%g}',
  )

  await page.getByRole('button', { name: 'Titel, Portionen, Zeiten …' }).click()
  const meta = page.getByRole('dialog', { name: 'Titel, Portionen, Zeiten' })
  await meta.getByLabel('Titel').fill('Rucolasalat')
  await meta.getByLabel('Portionen').fill('2')
  await meta.getByLabel('Tags').fill('Salat, schnell')
  await meta.getByRole('button', { name: 'Übernehmen' }).click()
  await page.getByRole('button', { name: 'Fertig' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rucolasalat')
  await expect(page.getByText('2 Portionen')).toBeVisible()
  await expect(page.getByText('schnell')).toBeVisible()
  await expect(page.getByText('vegan')).toBeVisible()
})

test('HTML im Rezepttext wird als Text angezeigt', async ({ page }) => {
  const problems = collectProblems(page)
  await setup(page)
  await createRecipe(
    page,
    '---\ntitle: <img src=x onerror=alert(1)>\n---\nMische <script>alert(2)</script> @Salz{}.',
  )
  await page.getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('<img src=x onerror=alert(1)>')
  await expect(page.locator('.steps')).toContainText('<script>alert(2)</script>')
  await expect(page.locator('main img, main script')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('Bewertung und Notiz', async ({ page }) => {
  await setup(page)
  await createRecipe(page, HEFETEIG)
  await page.getByRole('button', { name: 'Fertig' }).click()
  await page.getByRole('button', { name: '4 Sterne' }).click()
  await expect(page.getByRole('button', { name: '4 Sterne' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('Durchschnitt: 4 von 5 Sternen')).toBeVisible()
  await expect(page.getByText('Nur für dich sichtbar.')).toBeVisible()
  await page.getByLabel('Deine Notiz').fill('Mit Dinkelmehl probieren')
  await page.getByRole('button', { name: 'Notiz speichern' }).click()
  // IndexedDB schreibt asynchron; ein sofortiges Neuladen könnte den Schreibvorgang abbrechen.
  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByLabel('Deine Notiz')).toHaveValue('Mit Dinkelmehl probieren')
})

test('Suchen, filtern und Sammlungen', async ({ page }) => {
  await setup(page)
  await createRecipe(page, HEFETEIG)
  await page.getByRole('button', { name: 'Fertig' }).click()
  await createRecipe(
    page,
    '---\ntitle: Rucolasalat\ntags: [Salat, schnell]\ntime.prep: 10 min\n---\nMische @Rucola{100%g} mit @Olivenöl{2%EL}.',
  )
  await page.getByRole('button', { name: 'Fertig' }).click()
  await page.getByLabel('Neue Sammlung').fill('Sommer')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByRole('checkbox', { name: 'Sommer' })).toBeChecked()

  await page.getByRole('link', { name: '← Alle Rezepte' }).click()
  await page.getByLabel('Quelle').selectOption({ label: 'eigene' })
  const cards = page.locator('.cards h2')
  await expect(cards).toHaveText(['Hefeteig', 'Rucolasalat'])
  await page.getByLabel('Suchen', { exact: true }).fill('Mehl')
  await expect(cards).toHaveText(['Hefeteig'])
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click()
  await page.getByLabel('Ernährung').selectOption({ label: 'vegan' })
  await expect(cards).toHaveText(['Rucolasalat'])
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click()
  await page.getByRole('button', { name: /schnell/ }).click()
  await expect(cards).toHaveText(['Rucolasalat'])
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click()
  await page.getByLabel('Sammlung').selectOption({ label: 'Sommer' })
  await expect(cards).toHaveText(['Rucolasalat'])
  await expect(page.getByRole('status').filter({ hasText: '1 Rezept' })).toBeVisible()
})

test('Katalogrezept ansehen und übernehmen; Unterrezept aus dem Katalog', async ({ page }) => {
  await setup(page)
  await page
    .getByRole('navigation', { name: 'Hauptmenü' })
    .getByRole('link', { name: 'Rezepte' })
    .click()
  await page.getByLabel('Quelle').selectOption({ label: 'Katalog' })
  await page.getByRole('link', { name: 'Zwetschgendatschi' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zwetschgendatschi')
  await page.locator('summary', { hasText: 'Hefeteig' }).click()
  await expect(page.locator('.ingredients details')).toContainText('500 g Weizenmehl')
  await expect(page.getByText('vegetarisch')).toBeVisible()
  await page.getByRole('button', { name: 'In meine Rezepte übernehmen' }).click()
  await expect(page.getByText('Übernommen aus dem Katalog')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bearbeiten' })).toBeVisible()
  // Die Referenz auf den Katalog-Hefeteig löst weiterhin auf.
  await expect(page.locator('.ingredients details summary')).toContainText('Hefeteig')
})

test('Rezept teilen, als .cook speichern und wieder importieren', async ({ page }) => {
  await setup(page)
  await createRecipe(page, HEFETEIG)
  await page.getByRole('button', { name: 'Fertig' }).click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Als .cook speichern' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Hefeteig.cook')
  const path = await file.path()

  await page.getByRole('link', { name: '← Alle Rezepte' }).click()
  await page.locator('input[type=file]').setInputFiles(path)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hefeteig')
  await page.getByRole('link', { name: '← Alle Rezepte' }).click()
  await page.getByLabel('Quelle').selectOption({ label: 'eigene' })
  await expect(page.locator('.cards h2')).toHaveText(['Hefeteig', 'Hefeteig'])

  const zip = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Alle als ZIP sichern' }).click()
  expect((await zip).suggestedFilename()).toMatch(/^tafelrunde-rezepte-\d{4}-\d{2}-\d{2}\.zip$/)

  await page.locator('.cards a').first().click()
  await page.getByRole('button', { name: 'Teilen' }).click()
  await page.getByRole('button', { name: 'Freigabe erstellen' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hefeteig')
  await expect(page.getByRole('heading', { name: 'Jemanden einladen' })).toBeVisible()
})

test('Foto hinzufügen: verkleinert, lokal gespeichert, ohne CSP-Verstoß', async ({ page }) => {
  const problems = collectProblems(page)
  await setup(page)
  await createRecipe(page, HEFETEIG)
  await page.getByRole('button', { name: 'Fertig' }).click()

  // 2400×1200-PNG im Browser erzeugen und als Datei übergeben
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 2400
    canvas.height = 1200
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#D96B43'
    ctx.fillRect(0, 0, 2400, 1200)
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await page.locator('.photos input[type=file]').setInputFiles({
    name: 'kuchen.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png),
  })
  const img = page.getByRole('img', { name: 'Hefeteig, Foto 1' })
  await expect(img).toBeVisible()
  expect(await img.getAttribute('src')).toMatch(/^blob:/)
  expect(await img.getAttribute('width')).toBe('1600')
  expect(await img.getAttribute('height')).toBe('800')

  await page.waitForTimeout(500)
  await page.reload()
  await expect(page.getByRole('img', { name: 'Hefeteig, Foto 1' })).toBeVisible()
  await page.getByRole('button', { name: /Entfernen\s*:\s*Foto 1/ }).click()
  await expect(page.getByRole('img', { name: 'Hefeteig, Foto 1' })).toHaveCount(0)
  expect(problems).toEqual([])
})

for (const theme of ['light', 'dark'] as const) {
  test(`Barrierefreiheit Rezeptansicht und Editor (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await setup(page)
    await createRecipe(page, KUCHEN)
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      return results.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`))
    }
    expect(await scan()).toEqual([])
    await page.getByRole('button', { name: 'Fertig' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Zwetschgenkuchen')
    expect(await scan()).toEqual([])
  })
}
