<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { googleConfigErrors, googleProjectNumber, parseGoogleConfig } from '@/core/base'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import { googleSetupInfo, saveGoogleConfig } from '../google-config'
import { auth, currentRoute, googleConfig } from '../storage'

/**
 * Google-Projekt für dieses Gerät eintragen. Jede Instanz (auch ein Fork unter
 * eigener Adresse) braucht ein eigenes Projekt, in dem genau diese Adresse
 * freigegeben ist. Client-ID und API-Key sind öffentlich; sie bleiben auf dem
 * Gerät und reisen in Einladungen mit.
 */
const info = googleSetupInfo()
const clientId = ref(googleConfig?.clientId ?? '')
const apiKey = ref(googleConfig?.apiKey ?? '')
const touched = ref(false)
const errors = computed(() =>
  touched.value ? googleConfigErrors({ clientId: clientId.value, apiKey: apiKey.value }) : {},
)
const changed = computed(
  () =>
    clientId.value.trim() !== googleConfig?.clientId ||
    apiKey.value.trim() !== googleConfig?.apiKey,
)
const switchingProject = computed(() => {
  const next = parseGoogleConfig({ clientId: clientId.value, apiKey: apiKey.value })
  return !!googleConfig && !!next && googleProjectNumber(next) !== googleProjectNumber(googleConfig)
})

/** Neue Werte wirken nach einem Neustart der App (Speicheranbieter wird beim Start gewählt). */
function save() {
  touched.value = true
  const config = parseGoogleConfig({ clientId: clientId.value, apiKey: apiKey.value })
  if (!config) return
  saveGoogleConfig(config)
  location.assign(`${location.pathname}#/`)
  location.reload()
}

const confirmRemove = ref(false)
function remove() {
  auth?.disconnect()
  saveGoogleConfig(undefined)
  location.assign(`${location.pathname}#/`)
  location.reload()
}

const copied = ref<string>()
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
  } catch {
    copied.value = undefined
  }
}
</script>

<template>
  <p><RouterLink :to="{ name: 'home' }">← Zurück</RouterLink></p>
  <h1>Mit Google verbinden</h1>
  <p>
    Tafelrunde speichert verschlüsselt in deinem Google Drive. Dafür braucht es ein kostenloses
    Google-Cloud-Projekt. Wurdest du eingeladen, bringt die Einladung die Einstellungen mit – dann
    ist hier nichts zu tun.
  </p>

  <AppCard v-if="googleConfig" class="current">
    <h2>Aktuelles Projekt</h2>
    <p>
      Projekt-Nr. <strong>{{ googleProjectNumber(googleConfig) }}</strong> –
      {{ auth?.accessToken() ? 'angemeldet' : 'nicht angemeldet' }}.
    </p>
    <AppButton
      v-if="auth && !auth.accessToken()"
      variant="primary"
      @click="auth.login(currentRoute())"
    >
      Bei Google anmelden
    </AppButton>
  </AppCard>

  <form class="form" aria-labelledby="google-form-title" @submit.prevent="save">
    <h2 id="google-form-title">
      {{ googleConfig ? 'Projekt ändern' : 'Eigenes Projekt eintragen' }}
    </h2>
    <AppTextField
      v-model="clientId"
      label="OAuth-Client-ID"
      :error="errors.clientId"
      autocomplete="off"
      spellcheck="false"
      placeholder="1234567890-abc….apps.googleusercontent.com"
    />
    <AppTextField
      v-model="apiKey"
      label="API-Schlüssel"
      :error="errors.apiKey"
      autocomplete="off"
      spellcheck="false"
      placeholder="AIza…"
    />
    <p v-if="switchingProject" class="warning" role="status">
      Anderes Projekt: Dateien, die dieses Gerät mit dem bisherigen Projekt angelegt hat, kann es
      danach nicht mehr ändern. Es legt neue an; die anderen Geräte übernehmen sie automatisch.
    </p>
    <div class="row">
      <AppButton type="submit" variant="primary" :disabled="!changed"
        >Speichern und neu starten</AppButton
      >
      <AppButton v-if="googleConfig" variant="danger" @click="confirmRemove = true"
        >Entfernen</AppButton
      >
    </div>
  </form>

  <details class="help">
    <summary>So legst du ein Projekt an</summary>
    <ol>
      <li>
        In der Google Cloud Console ein Projekt anlegen und die <strong>Google Drive API</strong>
        aktivieren.
      </li>
      <li>
        OAuth-Zustimmungsbildschirm: Nutzertyp „Extern“, Status „Test“, deine E-Mail-Adressen als
        Testnutzer, einziger Scope <code>https://www.googleapis.com/auth/drive.file</code>.
      </li>
      <li>
        OAuth-Client vom Typ „Webanwendung“ anlegen und für diese Adresse freigeben:
        <dl>
          <dt>Autorisierte JavaScript-Quelle</dt>
          <dd>
            <code>{{ info.origin }}</code>
            <AppButton variant="ghost" @click="copy(info.origin)">
              Kopieren<span class="visually-hidden">: JavaScript-Quelle</span>
            </AppButton>
          </dd>
          <dt>Autorisierte Weiterleitungs-URI</dt>
          <dd>
            <code>{{ info.redirectUri }}</code>
            <AppButton variant="ghost" @click="copy(info.redirectUri)">
              Kopieren<span class="visually-hidden">: Weiterleitungs-URI</span>
            </AppButton>
          </dd>
        </dl>
      </li>
      <li>
        API-Schlüssel anlegen, auf die Google Drive API beschränken, als Website-Beschränkung
        <code>{{ info.referrer }}</code> eintragen.
      </li>
      <li>Client-ID und API-Schlüssel oben eintragen.</li>
    </ol>
    <p v-if="copied" role="status" class="muted">Kopiert.</p>
    <p class="muted">
      Beide Werte sind nicht geheim; sie stehen in jeder Anfrage an Google. Geschützt sind sie durch
      die Freigabe nur für diese Adresse. Die Anmeldung selbst (das Token) bleibt nur im
      Arbeitsspeicher dieses Geräts.
    </p>
  </details>

  <AppDialog v-model:open="confirmRemove" title="Google-Projekt entfernen?">
    <p>
      Dieses Gerät synchronisiert danach nicht mehr. Deine Daten bleiben auf dem Gerät, die Dateien
      in Google Drive bleiben bestehen.
    </p>
    <template #actions>
      <AppButton @click="confirmRemove = false">Abbrechen</AppButton>
      <AppButton variant="danger" @click="remove">Entfernen</AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--space-3);
  margin: var(--space-6) 0;
  max-width: 36rem;
}
.form h2 {
  margin: 0;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.current {
  margin-top: var(--space-4);
}
.help {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.help summary {
  font-weight: 600;
  cursor: pointer;
}
code {
  overflow-wrap: anywhere;
}
dd {
  margin: 0 0 var(--space-2);
}
dt {
  font-weight: 600;
}
.warning {
  padding: var(--space-2) var(--space-3);
  border-left: 4px solid var(--warning);
  background: var(--surface);
}
.muted {
  color: var(--text-muted);
}
</style>
