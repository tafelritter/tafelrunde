// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Rezept-Import (plan/06-phase-4-import-naehrwerte.md, Teil A). */

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

/** Testseite mit strukturierten Daten, wie viele Rezeptseiten sie haben. */
const RECIPE_PAGE = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>Linsensuppe – Rezeptseite</title>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Linsensuppe',
  recipeYield: '4 Portionen',
  prepTime: 'PT15M',
  cookTime: 'PT40M',
  image: 'https://rezepte.example/linsen.jpg',
  recipeIngredient: [
    '250 g Linsen',
    '2 Möhren',
    '1 Zwiebel, gewürfelt',
    '1 l Gemüsebrühe',
    '2 EL Essig',
    'Salz <img src=x onerror=alert(1)>',
  ],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Zwiebel und Möhren würfeln und andünsten.' },
    { '@type': 'HowToStep', text: 'Linsen und Gemüsebrühe dazugeben, 40 Minuten köcheln.' },
    { '@type': 'HowToStep', text: 'Mit Essig abschmecken.' },
  ],
})}</script></head><body><h1>Linsensuppe</h1></body></html>`

test('Import per Bookmarklet von einer Rezeptseite mit JSON-LD', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, 'Bookmarklet nur am Desktop (4.2); Android nutzt das Teilen-Menü')
  const problems = collectProblems(page)
  await setup(page)
  await page.goto('/#/import')
  const href = await page.getByRole('link', { name: 'Zu Tafelrunde' }).getAttribute('href')
  expect(href).toMatch(/^javascript:/)

  await context.route('https://rezepte.example/**', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: RECIPE_PAGE }),
  )
  const site = await context.newPage()
  await site.goto('https://rezepte.example/linsensuppe')
  const popupPromise = context.waitForEvent('page')
  await site.evaluate(decodeURIComponent(href!.slice('javascript:'.length)))
  const app = await popupPromise
  const appProblems = collectProblems(app)

  await expect(app.getByRole('heading', { name: 'Entwurf prüfen' })).toBeVisible()
  await expect(app.getByText('4 Portionen')).toBeVisible()
  await expect(app.getByText('55 min')).toBeVisible()
  await expect(app.getByRole('link', { name: 'https://rezepte.example/linsensuppe' })).toBeVisible()
  const table = app.getByRole('table', { name: 'Erkannte Zutaten' })
  await expect(table.getByRole('row')).toHaveCount(7)
  await expect(table.getByRole('row', { name: /250 g Linsen/ })).toContainText('im Schritt')
  const source = app.getByLabel('Cooklang-Entwurf')
  await expect(source).toHaveValue(/@Linsen\{250%g\}/)
  await expect(source).toHaveValue(/imported: \d{4}-\d{2}-\d{2}/)
  await expect(source).not.toHaveValue(/linsen\.jpg/)

  await app.getByRole('button', { name: 'Als Entwurf speichern' }).click()
  await expect(app.getByRole('textbox', { name: 'Rezepttext in Cooklang' })).toBeVisible()
  await app.getByRole('button', { name: 'Fertig' }).click()
  await expect(app.getByRole('heading', { level: 1 })).toHaveText('Linsensuppe')
  await expect(app.locator('.ingredients')).toContainText('250 g')
  // HTML aus der Seite wird zu reinem Text
  await expect(app.locator('.ingredients')).toContainText('Salz')
  await expect(app.locator('.ingredients img')).toHaveCount(0)
  expect([...problems, ...appProblems]).toEqual([])
})

test('Text einfügen ergibt einen Entwurf', async ({ page }) => {
  await setup(page)
  await page
    .getByRole('navigation', { name: 'Hauptmenü' })
    .getByRole('link', { name: 'Rezepte' })
    .click()
  await page.getByRole('link', { name: 'Von Rezeptseite oder Text' }).click()
  await page.getByLabel('Rezepttext einfügen').fill(`Tomatensalat
Zutaten für 2 Portionen
500 g Tomaten
1 Zwiebel
2 EL Essig
Zubereitung
Tomaten und Zwiebel schneiden, mit dem Essig mischen.`)
  await page.getByRole('button', { name: 'Entwurf erstellen' }).click()
  await expect(page.getByText('2 Portionen')).toBeVisible()
  await page.getByRole('button', { name: 'Als Entwurf speichern' }).click()
  await page.getByRole('button', { name: 'Fertig' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tomatensalat')
  await expect(page.locator('.ingredients')).toContainText('500 g')
})

test('Geteilter Text (Android) öffnet den Import, eine Adresse allein ergibt einen Hinweis', async ({
  page,
}) => {
  await setup(page)
  await page.goto(
    `/?title=${encodeURIComponent('Kräuterquark')}&text=${encodeURIComponent(
      '250 g Quark\n1 Bund Schnittlauch\nQuark mit Schnittlauch verrühren.',
    )}`,
  )
  await expect(page.getByRole('heading', { name: 'Entwurf prüfen' })).toBeVisible()
  await expect(page.getByLabel('Cooklang-Entwurf')).toHaveValue(/title: Kräuterquark/)
  // Geteilter Inhalt bleibt nicht in der Adresse stehen
  expect(page.url()).not.toContain('Quark')

  await page.goto(`/?url=${encodeURIComponent('https://rezepte.example/lasagne')}`)
  await expect(page.getByRole('alert')).toContainText('Rezepttext markieren und teilen')
})

for (const theme of ['light', 'dark'] as const) {
  test(`Barrierefreiheit Import (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    await setup(page)
    await page.goto('/#/import')
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      return results.violations.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(' ')}`))
    }
    expect(await scan()).toEqual([])
    await page.getByLabel('Rezepttext einfügen').fill('Brot\n500 g Mehl\nMehl kneten.')
    await page.getByRole('button', { name: 'Entwurf erstellen' }).click()
    await expect(page.getByRole('heading', { name: 'Entwurf prüfen' })).toBeVisible()
    expect(await scan()).toEqual([])
    await page.screenshot({ path: `test-results/import-${theme}.png`, fullPage: true })
  })
}
