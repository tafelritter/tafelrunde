// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AppButton from './AppButton.vue'
import AppTextField from './AppTextField.vue'
import AppListItem from './AppListItem.vue'
import AppToast from './AppToast.vue'
import SyncStatus from './SyncStatus.vue'

describe('AppButton', () => {
  it('ist standardmäßig type=button', () => {
    const w = mount(AppButton, { slots: { default: 'OK' } })
    expect(w.get('button').attributes('type')).toBe('button')
    expect(w.text()).toBe('OK')
  })
})

describe('AppTextField', () => {
  it('verknüpft Label, Hinweis und Fehler barrierefrei', () => {
    const w = mount(AppTextField, { props: { label: 'Name', hint: 'H', error: 'F' } })
    const input = w.get('input')
    expect(w.get('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')?.split(' ')).toHaveLength(2)
  })
  it('stellt Eingaben als Text dar, nie als HTML', () => {
    const w = mount(AppTextField, { props: { label: '<b>x</b>' } })
    expect(w.get('label').element.innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;')
  })
})

describe('AppListItem', () => {
  it('meldet das Abhaken über v-model:done', async () => {
    const w = mount(AppListItem, { props: { label: 'Milch', done: false } })
    await w.get('input').setValue(true)
    expect(w.emitted('update:done')?.[0]).toEqual([true])
  })
})

describe('AppToast', () => {
  it('nutzt role=alert für Fehler, sonst role=status', () => {
    expect(
      mount(AppToast, { props: { tone: 'error' } })
        .get('div')
        .attributes('role'),
    ).toBe('alert')
    expect(mount(AppToast).get('div').attributes('role')).toBe('status')
  })
  it('schließt sich nach duration selbst', () => {
    vi.useFakeTimers()
    const w = mount(AppToast, { props: { duration: 6000 } })
    vi.advanceTimersByTime(5999)
    expect(w.emitted('dismiss')).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(w.emitted('dismiss')).toHaveLength(1)
    vi.useRealTimers()
  })
  it('bleibt ohne duration stehen und räumt den Timer beim Entfernen ab', () => {
    vi.useFakeTimers()
    const w = mount(AppToast)
    vi.advanceTimersByTime(60_000)
    expect(w.emitted('dismiss')).toBeUndefined()
    const timed = mount(AppToast, { props: { duration: 1000 } })
    timed.unmount()
    vi.advanceTimersByTime(1000)
    expect(timed.emitted('dismiss')).toBeUndefined()
    vi.useRealTimers()
  })
})

describe('SyncStatus', () => {
  it('zeigt Zustand und Uhrzeit des letzten Abgleichs', () => {
    const w = mount(SyncStatus, {
      props: { state: 'login-required', lastSync: new Date(2026, 0, 1, 9, 5) },
    })
    expect(w.text()).toContain('Anmeldung nötig')
    expect(w.text()).toContain('09:05')
  })
})
