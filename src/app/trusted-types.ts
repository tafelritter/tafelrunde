// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Trusted Types: Die CSP erlaubt nur die Richtlinien `vue` (von Vue selbst) und
 * `tafelrunde-sw`. Diese lässt ausschließlich die URL des eigenen Service Workers zu.
 */
export const SW_POLICY = 'tafelrunde-sw'

interface PolicyFactory {
  createPolicy(
    name: string,
    rules: { createScriptURL: (input: string) => string },
  ): { createScriptURL(input: string): unknown }
}

export function trustedServiceWorkerUrl(
  url: string,
  factory: PolicyFactory | undefined = (globalThis as { trustedTypes?: PolicyFactory })
    .trustedTypes,
): string {
  if (!factory) return url
  const policy = factory.createPolicy(SW_POLICY, {
    createScriptURL: (input) => {
      if (input !== url) throw new TypeError(`Unerlaubte Skript-URL: ${input}`)
      return input
    },
  })
  // TrustedScriptURL; workbox-window und register() akzeptieren beide Typen.
  return policy.createScriptURL(url) as string
}
