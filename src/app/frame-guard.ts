// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Ersatz für `frame-ancestors`, das per Meta-Tag nicht wirkt: Läuft die App in einem
 * fremden Frame, wird nichts gerendert (Schutz gegen Clickjacking).
 */
export function isFramed(win: { readonly self: unknown; readonly top: unknown }): boolean {
  try {
    return win.self !== win.top
  } catch {
    // Zugriff auf `top` über Origin-Grenzen wirft in manchen Browsern.
    return true
  }
}
