// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: { port: 5173, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL('../../dist-spike', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: { main: `${root}index.html`, callback: `${root}auth/callback.html` },
    },
  },
})
