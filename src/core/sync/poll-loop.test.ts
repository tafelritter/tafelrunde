// SPDX-License-Identifier: AGPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PollLoop } from './poll-loop'
import { StorageError } from './provider'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('PollLoop', () => {
  it('fragt sofort und dann im Intervall ab', async () => {
    const poll = vi.fn(() => Promise.resolve())
    const loop = new PollLoop({ poll, intervalMs: 3000 })
    loop.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(9000)
    expect(poll).toHaveBeenCalledTimes(4)
    loop.stop()
  })

  it('pausiert im Hintergrund und fragt beim Zurückkehren sofort ab', async () => {
    const poll = vi.fn(() => Promise.resolve())
    const loop = new PollLoop({ poll, intervalMs: 3000 })
    loop.start()
    await vi.advanceTimersByTimeAsync(0)
    loop.setVisible(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(poll).toHaveBeenCalledTimes(1)
    loop.setVisible(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(2)
    loop.stop()
  })

  it('verlängert den Abstand bei Fehlern exponentiell, begrenzt', async () => {
    const poll = vi.fn<() => Promise<void>>(() => Promise.reject(new StorageError('offline')))
    const loop = new PollLoop({ poll, intervalMs: 1000, maxBackoffMs: 8000 })
    loop.start()
    await vi.advanceTimersByTimeAsync(0)
    const delays: number[] = []
    for (let i = 0; i < 5; i++) {
      delays.push(loop.nextDelayMs)
      await vi.advanceTimersByTimeAsync(loop.nextDelayMs)
    }
    expect(delays).toEqual([2000, 4000, 8000, 8000, 8000])
    poll.mockImplementation(() => Promise.resolve())
    await vi.advanceTimersByTimeAsync(8000)
    expect(loop.nextDelayMs).toBe(1000)
    loop.stop()
  })

  it('respektiert die Wartezeit des Anbieters', async () => {
    const poll = vi.fn(() => Promise.reject(new StorageError('rate-limited', 'x', 30_000)))
    const loop = new PollLoop({ poll, intervalMs: 3000 })
    loop.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(loop.nextDelayMs).toBeGreaterThanOrEqual(30_000)
    loop.stop()
  })

  it('meldet unerwartete Fehler und läuft weiter', async () => {
    const onUnexpectedError = vi.fn()
    const poll = vi.fn(() => Promise.reject(new Error('kaputt')))
    const loop = new PollLoop({ poll, intervalMs: 1000, onUnexpectedError })
    loop.start()
    await vi.advanceTimersByTimeAsync(3000)
    expect(onUnexpectedError).toHaveBeenCalled()
    expect(poll.mock.calls.length).toBeGreaterThan(1)
    loop.stop()
  })

  it('wechselt sofort auf ein kürzeres Intervall', async () => {
    const poll = vi.fn(() => Promise.resolve())
    const loop = new PollLoop({ poll, intervalMs: 15_000 })
    loop.start()
    await vi.advanceTimersByTimeAsync(0)
    loop.setInterval(3000)
    await vi.advanceTimersByTimeAsync(0)
    expect(poll).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3000)
    expect(poll).toHaveBeenCalledTimes(3)
    loop.stop()
  })

  it('führt nie zwei Abfragen gleichzeitig aus', async () => {
    let active = 0
    let max = 0
    const poll = vi.fn(async () => {
      max = Math.max(max, ++active)
      await new Promise((r) => setTimeout(r, 5000))
      active--
    })
    const loop = new PollLoop({ poll, intervalMs: 1000 })
    loop.start()
    void loop.pollNow()
    void loop.pollNow()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(max).toBe(1)
    loop.stop()
  })
})
