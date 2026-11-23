// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Prüft die Lizenzen aller Abhängigkeiten gegen eine Allowlist AGPL-3.0-kompatibler Lizenzen.
 * Produktionsabhängigkeiten landen im ausgelieferten Bundle und werden streng geprüft;
 * Entwicklungsabhängigkeiten werden nur ausgeführt, nicht verbreitet.
 */
import { execFileSync } from 'node:child_process'

const ALLOWED = new Set([
  '0BSD',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'LGPL-3.0-or-later',
  'MIT',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'Zlib',
])
// Nur für Werkzeuge im Build/Test erlaubt (z. B. Daten-Pakete wie caniuse-lite, axe).
const ALLOWED_DEV_ONLY = new Set(['CC-BY-4.0', 'MPL-2.0'])

function isAllowed(expression, allowed) {
  // Einfache SPDX-Ausdrücke: "A OR B" ist erlaubt, wenn eine Seite erlaubt ist; "A AND B", wenn beide.
  const expr = expression.replace(/[()]/g, '').trim()
  if (expr.includes(' OR ')) return expr.split(' OR ').some((p) => isAllowed(p, allowed))
  if (expr.includes(' AND ')) return expr.split(' AND ').every((p) => isAllowed(p, allowed))
  return allowed.has(expr)
}

function list(prod) {
  const args = ['licenses', 'list', '--json', ...(prod ? ['--prod'] : [])]
  // Über `pnpm licenses:check` gestartet zeigt npm_execpath auf pnpm selbst (ohne Shell).
  const pnpm = process.env.npm_execpath
  const out = pnpm?.endsWith('js')
    ? execFileSync(process.execPath, [pnpm, ...args], { encoding: 'utf8' })
    : execFileSync('pnpm', args, { encoding: 'utf8' })
  return JSON.parse(out || '{}')
}

const failures = []
for (const prod of [true, false]) {
  const allowed = prod ? ALLOWED : new Set([...ALLOWED, ...ALLOWED_DEV_ONLY])
  for (const [license, packages] of Object.entries(list(prod))) {
    if (isAllowed(license, allowed)) continue
    for (const pkg of packages) {
      failures.push(`${prod ? 'prod' : 'dev '}  ${pkg.name}@${pkg.versions.join(', ')}: ${license}`)
    }
  }
}

if (failures.length) {
  console.error('Nicht freigegebene Lizenzen:\n' + [...new Set(failures)].join('\n'))
  process.exit(1)
}
console.log('Alle Lizenzen sind freigegeben.')
