// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rückkehrseite des OAuth-Logins. Liegt bewusst außerhalb des Routers, weil Google die
 * Antwort im URL-Fragment liefert und das mit dem Hash-Routing kollidieren würde.
 */
import { completeOAuthCallback } from '../src/providers/gdrive/oauth'

const target = completeOAuthCallback(
  window.location,
  window.sessionStorage,
  window.history,
  Date.now(),
)
window.location.replace(new URL(target, new URL('../', window.location.href)).href)
