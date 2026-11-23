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

test('Startseite lädt ohne Fehler und CSP-Verstöße', async ({ page }) => {
  const problems = collectProblems(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Willkommen bei Tafelrunde')
  await page.goto('/#/komponenten')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Basis-Komponenten')
  await page.getByRole('button', { name: 'Dialog öffnen' }).click()
  await expect(page.getByRole('dialog', { name: 'Liste löschen?' })).toBeVisible()
  expect(problems).toEqual([])
})

test('CSP und Referrer-Policy stehen ganz am Anfang des head', async ({ page }) => {
  await page.goto('/')
  const first = await page.evaluate(() =>
    [...document.head.children].slice(0, 2).map((el) => el.outerHTML),
  )
  expect(first[0]).toContain('http-equiv="Content-Security-Policy"')
  expect(first[0]).not.toContain('unsafe-inline')
  expect(first[1]).toContain('name="referrer" content="no-referrer"')
})

for (const theme of ['light', 'dark'] as const) {
  for (const path of ['/', '/#/komponenten']) {
    test(`Barrierefreiheit (${theme}) ${path}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(
        results.violations.flatMap((v) =>
          v.nodes.map((n) => `${v.id} ${n.target.join(' ')}: ${n.failureSummary ?? ''}`),
        ),
      ).toEqual([])
    })
  }
}

test('rendert nicht in einem fremden Frame', async ({ page }) => {
  // Fremde Seite simulieren, die die App einbettet
  await page.route('**/frame-host.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<iframe id="probe" src="/"></iframe>' }),
  )
  await page.goto('/frame-host.html')
  const frame = page.frameLocator('#probe')
  await expect(frame.locator('body')).toContainText('nicht in einem fremden Rahmen')
  await expect(frame.locator('#app')).toHaveCount(0)
})

test('OAuth-Rückkehr entfernt das Token aus der URL und verwirft fremde Antworten', async ({
  page,
}) => {
  await page.goto('/auth/callback.html#state=fremd&access_token=geheim&expires_in=3600')
  // Ohne Profil leitet die App danach zur Einrichtung weiter.
  await page.waitForURL((url) => url.pathname === '/' && /^#\/(einrichten)?$/.test(url.hash))
  expect(page.url()).not.toContain('geheim')
  const result = await page.evaluate(() => sessionStorage.getItem('tafelrunde.oauth.result'))
  if (result) {
    expect(JSON.parse(result)).toEqual({ ok: false, error: 'state_mismatch' })
  } else {
    // Mit Google-Konfiguration hat die App das Ergebnis schon übernommen – und kein Token.
    await expect(page.getByRole('button', { name: 'Mit Google verbinden' })).toBeVisible()
  }
})

test('Web-App-Manifest ist installierbar konfiguriert', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const manifest = (await res.json()) as { display: string; icons: { sizes: string }[] }
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
})

test.describe('mit Service Worker', () => {
  test.use({ serviceWorkers: 'allow' })

  test('Service Worker registriert sich trotz Trusted Types und die App startet offline', async ({
    page,
    context,
  }) => {
    const problems = collectProblems(page)
    await page.goto('/')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Willkommen bei Tafelrunde')
    await context.setOffline(false)
    expect(problems.filter((p) => !p.includes('net::ERR_INTERNET_DISCONNECTED'))).toEqual([])
  })

  test('Hinweis „offline verfügbar“ verschwindet von selbst und blockiert nichts', async ({
    page,
  }) => {
    await page.goto('/')
    const toast = page.getByRole('status').filter({ hasText: 'offline verfügbar' })
    await expect(toast).toBeVisible()
    await expect(toast).toBeHidden({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Los geht’s' }).click({ timeout: 2_000 })
    await page.goto('/#/komponenten')
    await page.getByRole('button', { name: 'Dialog öffnen' }).click({ timeout: 2_000 })
    await expect(page.getByRole('dialog', { name: 'Liste löschen?' })).toBeVisible()
  })
})
