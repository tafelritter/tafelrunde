// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Content-Security-Policy der App. GitHub Pages erlaubt keine eigenen HTTP-Header,
 * deshalb landet die Policy als <meta http-equiv> ganz am Anfang des <head>.
 * `frame-ancestors` wirkt per Meta-Tag nicht; dafür sorgt die Frame-Erkennung in main.ts.
 */
export interface CspOptions {
  /** Entwicklungsserver: Vite braucht WebSocket für HMR und injiziert Styles inline. */
  dev?: boolean
}

export function buildCsp({ dev = false }: CspOptions = {}): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': dev
      ? ["'self'", 'https://www.googleapis.com', 'ws://localhost:*']
      : ["'self'", 'https://www.googleapis.com'],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
  }
  if (!dev) {
    directives['require-trusted-types-for'] = ["'script'"]
    // vue: Richtlinie von Vue für statische Inhalte; tafelrunde-sw: nur die eigene
    // Service-Worker-URL (src/app/trusted-types.ts). Eine default-Richtlinie gibt es nicht.
    directives['trusted-types'] = ['vue', 'tafelrunde-sw']
  }
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(' '))
    .join('; ')
}
