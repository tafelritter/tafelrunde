<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, shallowRef, toRef } from 'vue'
import { RouterLink } from 'vue-router'
import {
  type Code,
  CodeError,
  codeLink,
  decodeCode,
  listMembers,
  renameDevice,
  renameSpace,
  spaceKind,
  spaceName,
} from '@/core/base'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import QrCode from '@/ui/components/QrCode.vue'
import QrScanner from '@/ui/components/QrScanner.vue'
import { useSpace } from '../workspace/use-space'
import { markRecoverySeen } from '../recovery-hint'
import StoresCard from './StoresCard.vue'
import { workspace } from '../workspace/use-workspace'

const props = defineProps<{ spaceId: string }>()
const { doc, version, error } = useSpace(toRef(props, 'spaceId'), { active: true })
const selfId = ref('')
void workspace().then((ws) => (selfId.value = ws.profile?.deviceId ?? ''))

const name = computed(() => (version.value, doc.value ? spaceName(doc.value) : ''))
const kind = computed(() => (version.value, doc.value ? spaceKind(doc.value) : undefined))
const members = computed(() => (version.value, doc.value ? listMembers(doc.value) : []))
const appUrl = () => `${location.origin}${location.pathname}`

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// --- Umbenennen ---------------------------------------------------------------

const newName = ref<string>()
function saveName() {
  if (doc.value && newName.value?.trim()) renameSpace(doc.value, newName.value)
  newName.value = undefined
}

const deviceName = ref<string>()
async function saveDeviceName() {
  if (!deviceName.value?.trim()) return
  const ws = await workspace()
  await ws.updateProfile({ deviceName: deviceName.value.trim() })
  if (doc.value) renameDevice(doc.value, selfId.value, deviceName.value)
  deviceName.value = undefined
}

// --- Codes anzeigen -----------------------------------------------------------

const shown = shallowRef<{ title: string; code: Code; link: string; secret: boolean }>()
const codeError = ref<string>()

async function show(kindOfCode: 'invite' | 'recovery' | 'reply' | 'rekey') {
  codeError.value = undefined
  shown.value = undefined
  try {
    const ws = await workspace()
    const code =
      kindOfCode === 'invite' || kindOfCode === 'rekey'
        ? await ws.invite(props.spaceId)
        : kindOfCode === 'recovery'
          ? await ws.recoveryCode(props.spaceId)
          : await ws.reply(props.spaceId)
    shown.value = {
      title:
        kindOfCode === 'rekey'
          ? 'Neuer Schlüssel – allen verbleibenden Geräten zeigen'
          : kindOfCode === 'invite'
            ? 'Einladung'
            : kindOfCode === 'recovery'
              ? 'Wiederherstellungscode'
              : 'Antwort-Code',
      code,
      link: codeLink(appUrl(), code),
      secret: kindOfCode !== 'reply',
    }
    if (kindOfCode === 'recovery') markRecoverySeen(props.spaceId)
  } catch (e) {
    codeError.value = message(e)
  }
}

// --- Gerät entfernen ---------------------------------------------------------

const removing = shallowRef<{ deviceId: string; label: string }>()
async function confirmRemove() {
  if (!removing.value) return
  const id = removing.value.deviceId
  removing.value = undefined
  try {
    await (await workspace()).removeDevice(props.spaceId, id)
    await show('rekey')
  } catch (e) {
    codeError.value = message(e)
  }
}

const copied = ref(false)
async function copy() {
  if (!shown.value) return
  await navigator.clipboard.writeText(shown.value.link)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function printPage() {
  window.print()
}

// --- Antwort-Code annehmen ----------------------------------------------------

const replyInput = ref('')
const replyError = ref<string>()
const replyOk = ref<string>()

async function acceptReply(input = replyInput.value) {
  replyError.value = undefined
  replyOk.value = undefined
  try {
    const code = decodeCode(input)
    if (code.type !== 'reply') throw new CodeError('Das ist kein Antwort-Code.')
    if (code.spaceId !== props.spaceId)
      throw new CodeError('Der Antwort-Code gehört zu einem anderen Bereich.')
    await (await workspace()).acceptReply(code)
    replyOk.value = `${code.person} (${code.deviceName || 'Gerät'}) ist jetzt dabei.`
    replyInput.value = ''
  } catch (e) {
    replyError.value = message(e)
  }
}
</script>

<template>
  <p><RouterLink :to="{ name: 'home' }">← Alle Listen</RouterLink></p>
  <p v-if="error" role="alert">{{ error }}</p>
  <template v-else-if="doc">
    <div class="title">
      <h1>{{ name }}</h1>
      <AppButton v-if="kind !== 'personal'" variant="ghost" @click="newName = name"
        >Umbenennen</AppButton
      >
    </div>
    <form v-if="newName !== undefined" class="inline" @submit.prevent="saveName">
      <AppTextField v-model="newName" label="Neuer Name" maxlength="80" />
      <AppButton type="submit" variant="primary">Speichern</AppButton>
      <AppButton @click="newName = undefined">Abbrechen</AppButton>
    </form>

    <div class="stack">
      <AppCard>
        <h2>Mitglieder und Geräte</h2>
        <ul class="members">
          <li v-for="m in members" :key="m.deviceId">
            <span>
              <strong>{{ m.person || 'Unbekannt' }}</strong> · {{ m.deviceName || 'Gerät' }}
              <span v-if="m.deviceId === selfId" class="muted">(dieses Gerät)</span>
              <span v-else-if="!m.files.live" class="muted">(noch nicht synchronisiert)</span>
            </span>
            <AppButton
              v-if="m.deviceId === selfId"
              variant="ghost"
              @click="deviceName = m.deviceName"
            >
              Gerät umbenennen
            </AppButton>
            <AppButton
              v-else
              variant="danger"
              @click="removing = { deviceId: m.deviceId, label: `${m.person} · ${m.deviceName}` }"
            >
              Entfernen<span class="visually-hidden">: {{ m.person }} · {{ m.deviceName }}</span>
            </AppButton>
          </li>
        </ul>
        <form v-if="deviceName !== undefined" class="inline" @submit.prevent="saveDeviceName">
          <AppTextField v-model="deviceName" label="Gerätename" maxlength="60" />
          <AppButton type="submit" variant="primary">Speichern</AppButton>
        </form>
      </AppCard>

      <AppCard>
        <h2>{{ kind === 'personal' ? 'Eigenes Gerät hinzufügen' : 'Jemanden einladen' }}</h2>
        <ol class="steps">
          <li>Einladung hier anzeigen und auf dem neuen Gerät scannen oder den Link öffnen.</li>
          <li>
            Das neue Gerät zeigt danach einen Antwort-Code. Den hier unten scannen oder einfügen.
          </li>
        </ol>
        <div class="row">
          <AppButton variant="primary" @click="show('invite')">Einladung anzeigen</AppButton>
          <AppButton @click="show('reply')">Eigenen Antwort-Code anzeigen</AppButton>
        </div>
        <p v-if="codeError" role="alert" class="error">{{ codeError }}</p>

        <h3>Antwort-Code annehmen</h3>
        <QrScanner @detected="acceptReply" />
        <form class="inline" @submit.prevent="acceptReply()">
          <AppTextField v-model="replyInput" label="Antwort-Code oder Link" autocomplete="off" />
          <AppButton type="submit" :disabled="!replyInput.trim()">Annehmen</AppButton>
        </form>
        <p v-if="replyError" role="alert" class="error">{{ replyError }}</p>
        <p v-if="replyOk" role="status">{{ replyOk }}</p>
      </AppCard>

      <StoresCard v-if="kind === 'household'" :doc="doc" :version="version" />

      <AppCard>
        <h2>Wiederherstellung</h2>
        <p>
          Gehen alle Geräte verloren, lässt sich der Bereich nur mit diesem Code wiederherstellen.
          Drucke ihn aus und bewahre ihn sicher auf – wer ihn hat, kann alles lesen.
        </p>
        <AppButton @click="show('recovery')">Wiederherstellungscode anzeigen</AppButton>
      </AppCard>

      <AppCard v-if="shown" class="code" aria-live="polite">
        <h2>{{ shown.title }}</h2>
        <QrCode :value="shown.link" :label="`QR-Code: ${shown.title} für ${name}`" />
        <p v-if="shown.secret" class="warning">
          Enthält den Schlüssel zu „{{ name }}“. Am besten direkt scannen lassen; ein Link im
          Messenger-Verlauf bleibt dort lesbar.
        </p>
        <p class="link">{{ shown.link }}</p>
        <div class="row no-print">
          <AppButton @click="copy">{{ copied ? 'Kopiert' : 'Link kopieren' }}</AppButton>
          <AppButton v-if="shown.code.type === 'recovery'" @click="printPage">Drucken</AppButton>
          <AppButton variant="ghost" @click="shown = undefined">Ausblenden</AppButton>
        </div>
      </AppCard>
    </div>
  </template>

  <AppDialog
    :open="!!removing"
    title="Gerät entfernen?"
    @update:open="(v: boolean) => !v && (removing = undefined)"
  >
    <p v-if="removing">
      „{{ removing.label }}“ verliert den Zugriff auf alles, was ab jetzt geändert wird. Dafür
      bekommt der Bereich einen neuen Schlüssel, den du danach allen verbleibenden Geräten zeigst.
      Was das Gerät bereits gesehen hat, kann es weiterhin lesen.
    </p>
    <template #actions>
      <AppButton @click="removing = undefined">Abbrechen</AppButton>
      <AppButton variant="danger" @click="confirmRemove">Entfernen</AppButton>
    </template>
  </AppDialog>
</template>

<style scoped>
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.title h1 {
  margin: 0;
}
.stack {
  display: grid;
  gap: var(--space-4);
  margin-top: var(--space-4);
}
.members {
  margin: 0;
  padding: 0;
  list-style: none;
}
.members li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: var(--touch-target);
  border-bottom: 1px solid var(--border);
}
.inline {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.inline > :first-child {
  flex: 1 1 14rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.steps {
  padding-left: var(--space-6);
}
.muted {
  color: var(--text-muted);
}
.error {
  color: var(--error);
}
.warning {
  color: var(--warning);
}
.link {
  overflow-wrap: anywhere;
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-sm);
}
@media print {
  .no-print {
    display: none;
  }
}
</style>
