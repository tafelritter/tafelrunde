// SPDX-License-Identifier: AGPL-3.0-or-later
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'tafelrunde.theme'

export function readTheme(storage: Pick<Storage, 'getItem'> = localStorage): Theme {
  const value = storage.getItem(KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function setTheme(
  theme: Theme,
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  if (theme === 'system') {
    delete root.dataset.theme
    storage.removeItem(KEY)
  } else {
    root.dataset.theme = theme
    storage.setItem(KEY, theme)
  }
}

export function applyStoredTheme(): void {
  const theme = readTheme()
  if (theme !== 'system') document.documentElement.dataset.theme = theme
}
