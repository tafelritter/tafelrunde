// SPDX-License-Identifier: AGPL-3.0-or-later
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfigWithVueTs(
  {
    ignores: [
      'spikes/**', // Wegwerf-Code des Machbarkeitstests
      'dist/**',
      'dist-spike/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.lighthouseci/**',
    ],
  },
  pluginVue.configs['flat/recommended'],
  vueTsConfigs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,mts,vue}'],
    rules: {
      // XSS-Schutz: Nutzerinhalte (Rezepte, Notizen) werden nie als HTML gerendert.
      'vue/no-v-html': 'error',
      'vue/no-v-text-v-html-on-component': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Kein innerHTML – Inhalte als Text rendern.' },
        { property: 'outerHTML', message: 'Kein outerHTML – Inhalte als Text rendern.' },
        { property: 'insertAdjacentHTML', message: 'Kein insertAdjacentHTML.' },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Architekturregel: core ist frameworkfrei und kennt weder ui noch providers noch app.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['vue', 'vue-router', '@vue/*'], message: 'core ist frameworkfrei.' },
            {
              group: [
                '**/ui',
                '**/ui/**',
                '**/providers',
                '**/providers/**',
                '**/app',
                '**/app/**',
              ],
              message: 'core darf weder ui, providers noch app importieren.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/providers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui', '**/ui/**', '**/app', '**/app/**'],
              message: 'providers dürfen weder ui noch app importieren.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['**/app', '**/app/**'], message: 'ui darf app nicht importieren.' }],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'e2e/**/*.ts', '*.config.ts', 'build/**/*.ts', 'tools/**', 'spikes/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['**/*.mjs', 'tools/**', 'spikes/**/*.js'],
    extends: [vueTsConfigs.disableTypeChecked],
  },
  skipFormatting,
)
