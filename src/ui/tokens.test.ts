// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {')
  if (start < 0) throw new Error(`Block fehlt: ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  const vars: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim()
  return vars
}

const light = block(':root')
const darkOverrides = block(":root[data-theme='dark']")
const dark = { ...light, ...darkOverrides }

function resolve(theme: Record<string, string>, name: string): string {
  let value = theme[name]
  while (value?.startsWith('var(--')) value = theme[value.slice(6, -1)]
  if (!value) throw new Error(`Token fehlt: --${name}`)
  return value
}

// [Vordergrund, Hintergrund, Mindestkontrast]
const TEXT = 4.5
const UI = 3
const pairs: [string, string, number][] = [
  ['text', 'bg', TEXT],
  ['text', 'surface', TEXT],
  ['text-muted', 'bg', TEXT],
  ['text-muted', 'surface', TEXT],
  ['primary', 'bg', TEXT],
  ['primary', 'surface', TEXT],
  ['on-primary', 'primary', TEXT],
  ['accent-text', 'bg', TEXT],
  ['accent-text', 'surface', TEXT],
  ['on-accent', 'accent', TEXT],
  ['accent', 'surface', UI],
  ['border-strong', 'bg', UI],
  ['border-strong', 'surface', UI],
  ['checked', 'surface', UI - 0.1], // bewusst gedämpft (etwa 3:1), abgehakte Einträge
  ['error', 'bg', TEXT],
  ['error', 'surface', TEXT],
  ['warning', 'bg', TEXT],
  ['warning', 'surface', TEXT],
  ['success', 'surface', TEXT],
  ['focus', 'bg', UI],
  ['focus', 'surface', UI],
  ['on-badge', 'badge-1', TEXT],
  ['on-badge', 'badge-2', TEXT],
  ['on-badge', 'badge-3', TEXT],
]

describe.each([
  ['hell', light],
  ['dunkel', dark],
])('Design-Tokens %s', (_name, theme) => {
  it.each(pairs)('--%s auf --%s erreicht %d:1', (fg, bg, min) => {
    expect(contrastRatio(resolve(theme, fg), resolve(theme, bg))).toBeGreaterThanOrEqual(min)
  })
})

describe('Dunkelmodus', () => {
  it('System-Dunkel und erzwungenes Dunkel sind identisch', () => {
    expect(block(":root:not([data-theme='light'])")).toEqual(darkOverrides)
  })
})

describe('contrastRatio', () => {
  it('Schwarz auf Weiß ist 21:1', () => {
    expect(contrastRatio('#000', '#ffffff')).toBeCloseTo(21, 5)
  })
  it('lehnt ungültige Farben ab', () => {
    expect(() => contrastRatio('rot', '#fff')).toThrow()
  })
})
