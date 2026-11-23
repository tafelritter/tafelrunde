// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { SW_POLICY, trustedServiceWorkerUrl } from './trusted-types'

describe('trustedServiceWorkerUrl', () => {
  it('gibt ohne Trusted Types die URL unverändert zurück', () => {
    expect(trustedServiceWorkerUrl('/sw.js', undefined)).toBe('/sw.js')
  })
  it('erlaubt nur die eigene Service-Worker-URL', () => {
    let rule: ((s: string) => string) | undefined
    const factory = {
      createPolicy(name: string, rules: { createScriptURL: (s: string) => string }) {
        expect(name).toBe(SW_POLICY)
        rule = rules.createScriptURL
        return { createScriptURL: (s: string) => rules.createScriptURL(s) }
      },
    }
    expect(trustedServiceWorkerUrl('/sw.js', factory)).toBe('/sw.js')
    expect(() => rule!('https://evil.example/sw.js')).toThrow(TypeError)
  })
})
