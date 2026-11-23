// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { buildCsp } from './build/csp.ts'

/** Setzt CSP und Referrer-Policy als erste Elemente des <head> jeder HTML-Seite. */
function securityHeaders(): Plugin {
  let dev = false
  return {
    name: 'tafelrunde:security-meta',
    configResolved(config) {
      dev = config.command === 'serve' && config.mode !== 'production'
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const meta =
          `<meta http-equiv="Content-Security-Policy" content="${buildCsp({ dev })}">\n` +
          `    <meta name="referrer" content="no-referrer">`
        return html.replace('<!-- security-meta -->', meta)
      },
    },
  }
}

export default defineConfig({
  plugins: [
    securityHeaders(),
    vue(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'Tafelrunde',
        short_name: 'Tafelrunde',
        description: 'Rezepte, Wochenplan und geteilte Einkaufslisten',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#FAF8F5',
        theme_color: '#2D6A4F',
        // Rezepttext unter Android teilen (plan/06-phase-4-import-naehrwerte.md, 4.3).
        share_target: {
          action: './',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        navigateFallback: 'index.html',
        // Die OAuth-Rückkehr muss immer die echte Seite laden, nie die App-Shell.
        navigateFallbackDenylist: [/^\/auth\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        callback: fileURLToPath(new URL('./auth/callback.html', import.meta.url)),
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
