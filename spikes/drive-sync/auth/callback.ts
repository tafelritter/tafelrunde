// SPDX-License-Identifier: AGPL-3.0-or-later
import { completeOAuthCallback } from '../../../src/providers/gdrive/oauth'

const target = completeOAuthCallback(window.location, sessionStorage, history, Date.now())
location.replace('/' + target)
