// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Taktgeber für das Lesen (plan/03-phase-1-einkaufsliste.md, 1.4):
 * Intervall je Ansicht, nur solange die App sichtbar ist, sofortige Abfrage
 * beim Zurückkehren, bei Fehlern exponentiell wachsender Abstand.
 *
 * Die Sichtbarkeit meldet die App (Page Visibility API) über `setVisible`;
 * `core` greift selbst nicht auf `document` zu.
 */

import { StorageError } from './provider'

export interface PollLoopOptions {
  poll: () => Promise<void>
  intervalMs: number
  maxBackoffMs?: number
  onUnexpectedError?: (error: unknown) => void
}

export class PollLoop {
  private intervalMs: number
  private readonly maxBackoffMs: number
  private failures = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private visible = true
  private running = false
  private inFlight: Promise<void> | undefined

  constructor(private readonly o: PollLoopOptions) {
    this.intervalMs = o.intervalMs
    this.maxBackoffMs = o.maxBackoffMs ?? 5 * 60_000
  }

  start(): void {
    if (this.running) return
    this.running = true
    void this.tick()
  }

  stop(): void {
    this.running = false
    clearTimeout(this.timer)
    this.timer = undefined
  }

  /** Anderes Intervall, z. B. 3 s in der Listenansicht, sonst 15 s. */
  setInterval(ms: number): void {
    if (ms === this.intervalMs) return
    const faster = ms < this.intervalMs
    this.intervalMs = ms
    if (faster && this.failures === 0) this.reschedule(0)
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    if (!visible) {
      clearTimeout(this.timer)
      this.timer = undefined
    } else {
      // Beim Zurückkehren sofort abfragen und den Fehler-Abstand zurücksetzen.
      this.failures = 0
      this.reschedule(0)
    }
  }

  /** Sofort abfragen, z. B. beim Öffnen einer Ansicht. */
  pollNow(): Promise<void> {
    return this.tick()
  }

  get nextDelayMs(): number {
    if (this.failures === 0) return this.intervalMs
    return Math.min(this.intervalMs * 2 ** this.failures, this.maxBackoffMs)
  }

  private reschedule(delay: number): void {
    clearTimeout(this.timer)
    this.timer = undefined
    if (!this.running || !this.visible) return
    this.timer = setTimeout(() => void this.tick(), delay)
  }

  private tick(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = undefined
      this.reschedule(this.nextDelayMs)
    })
    return this.inFlight
  }

  private async run(): Promise<void> {
    try {
      await this.o.poll()
      this.failures = 0
    } catch (error) {
      // Der Takt läuft weiter; unerwartete Fehler gehen an den Aufrufer zur Anzeige/Protokollierung.
      this.failures++
      if (!(error instanceof StorageError)) {
        this.o.onUnexpectedError?.(error)
      } else if (error.retryAfterMs !== undefined) {
        // Wartezeit des Anbieters respektieren.
        while (this.nextDelayMs < error.retryAfterMs && this.nextDelayMs < this.maxBackoffMs) {
          this.failures++
        }
      }
    }
  }
}
