// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'build/**/*.test.ts', 'tools/**/*.test.mjs'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}', 'build/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/app/main.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
