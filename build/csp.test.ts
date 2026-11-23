// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { buildCsp } from './csp'

function parse(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((d) => {
      const [name, ...values] = d.trim().split(/\s+/)
      return [name, values]
    }),
  )
}

describe('buildCsp (Produktion)', () => {
  const csp = parse(buildCsp())
  it('erlaubt standardmäßig nur die eigene Herkunft', () => {
    expect(csp.get('default-src')).toEqual(["'self'"])
    expect(csp.get('script-src')).toEqual(["'self'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'none'"])
  })
  it('enthält weder unsafe-inline noch unsafe-eval', () => {
    expect(buildCsp()).not.toMatch(/unsafe-(inline|eval)/)
  })
  it('verbindet sich nur mit der eigenen Herkunft und den Google-APIs', () => {
    expect(csp.get('connect-src')).toEqual(["'self'", 'https://www.googleapis.com'])
  })
  it('erzwingt Trusted Types', () => {
    expect(csp.get('require-trusted-types-for')).toEqual(["'script'"])
    expect(csp.get('trusted-types')).toEqual(['vue', 'tafelrunde-sw'])
  })
})

describe('buildCsp (Entwicklung)', () => {
  it('lockert nur, was Vite für HMR braucht', () => {
    const csp = parse(buildCsp({ dev: true }))
    expect(csp.get('script-src')).toEqual(["'self'"])
    expect(csp.get('connect-src')).toContain('ws://localhost:*')
    expect(buildCsp({ dev: true })).not.toContain('unsafe-eval')
  })
})
