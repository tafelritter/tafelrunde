// SPDX-License-Identifier: AGPL-3.0-or-later
export type SyncState =
  'local' | 'synced' | 'pending' | 'offline' | 'login-required' | 'member-unreachable'

export const SYNC_LABELS: Record<SyncState, string> = {
  local: 'nur lokal',
  synced: 'synchron',
  pending: 'Änderungen ausstehend',
  offline: 'offline',
  'login-required': 'Anmeldung nötig',
  'member-unreachable': 'Mitglied nicht erreichbar',
}
