<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import {
  type JoinReply,
  type SpaceAccess,
  codeLink,
  decodeCode,
  getLists,
  spaceName,
} from '@/core/base'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import QrCode from '@/ui/components/QrCode.vue'
import { bumpWorkspace, workspace } from '../workspace/use-workspace'

/**
 * Beitreten (Einladung) oder Wiederherstellen. Der Code steht im URL-Fragment
 * und erreicht keinen Server. Nach dem Beitritt ersetzt `router.replace` den
 * Verlaufseintrag, damit der Schlüssel nicht im Verlauf bleibt.
 */
const props = defineProps<{ code: string }>()
const router = useRouter()

const access = computed<SpaceAccess | undefined>(() => {
  try {
    const code = decodeCode(props.code)
    return code.type === 'reply' ? undefined : code
  } catch {
    return undefined
  }
})
const isRecovery = computed(() => access.value?.type === 'recovery')
/** Bereich gibt es hier schon: Der Code bringt einen neuen Schlüssel (nach dem Entfernen eines Geräts). */
const isRekey = ref(false)
void workspace().then((ws) => {
  if (access.value && ws.hasSpace(access.value.spaceId)) isRekey.value = true
})

const busy = ref(false)
const error = ref<string>()
const joined = shallowRef<{ spaceId: string; name: string; lists: number }>()
const reply = shallowRef<{ code: JoinReply; link: string }>()
const replyError = ref<string>()

async function join() {
  if (!access.value) return
  busy.value = true
  error.value = undefined
  try {
    const ws = await workspace()
    const handle = await ws.join(access.value)
    bumpWorkspace()
    joined.value = {
      spaceId: handle.record.id,
      name: spaceName(handle.doc) || access.value.name,
      lists: getLists(handle.doc).length,
    }
    // Schlüssel aus dem Verlauf entfernen.
    await router.replace({ name: 'join', params: { code: '-' } })
    await showReply()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function showReply() {
  if (!joined.value) return
  replyError.value = undefined
  try {
    const code = await (await workspace()).reply(joined.value.spaceId)
    reply.value = { code, link: codeLink(`${location.origin}${location.pathname}`, code) }
  } catch (e) {
    replyError.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <h1>{{ isRecovery ? 'Bereich wiederherstellen' : 'Einladung' }}</h1>

  <AppCard v-if="joined">
    <h2>Willkommen in „{{ joined.name }}“</h2>
    <p>
      {{ joined.lists === 1 ? 'Eine Liste ist' : `${joined.lists} Listen sind` }} jetzt auf diesem
      Gerät.
    </p>
    <template v-if="reply">
      <p>
        Damit die anderen deine Änderungen sehen, zeige diesen Antwort-Code dem Gerät, das dich
        eingeladen hat. Er enthält keinen Schlüssel.
      </p>
      <QrCode :value="reply.link" label="QR-Code: Antwort-Code" />
      <p class="link">{{ reply.link }}</p>
    </template>
    <p v-else-if="replyError">
      Lesen klappt bereits. Um selbst Änderungen zu teilen, verbinde dieses Gerät mit deinem
      Speicher; danach findest du den Antwort-Code beim Bereich unter „Mitglieder & Einladen“.
    </p>
    <AppButton variant="primary" @click="router.replace({ name: 'home' })">Zu den Listen</AppButton>
  </AppCard>

  <AppCard v-else-if="access">
    <p v-if="isRekey">
      Neuer Schlüssel für <strong>„{{ access.name || 'Ohne Namen' }}“</strong>. Übernimm ihn, damit
      du die Änderungen der anderen weiter siehst.
    </p>
    <p v-else-if="isRecovery">
      Mit diesem Code stellst du <strong>„{{ access.name || 'Ohne Namen' }}“</strong> auf diesem
      Gerät wieder her.
    </p>
    <p v-else>
      Du wurdest eingeladen zu <strong>„{{ access.name || 'Ohne Namen' }}“</strong>.
    </p>
    <p class="muted">
      Die Daten werden direkt aus dem Speicher der anderen geladen und nur auf diesem Gerät
      entschlüsselt.
    </p>
    <div class="row">
      <AppButton variant="primary" :disabled="busy" @click="join">
        {{ isRekey ? 'Schlüssel übernehmen' : isRecovery ? 'Wiederherstellen' : 'Beitreten' }}
      </AppButton>
      <AppButton @click="router.replace({ name: 'home' })">Abbrechen</AppButton>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </AppCard>

  <AppCard v-else>
    <p role="alert">Dieser Link ist ungültig oder unvollständig.</p>
    <AppButton @click="router.replace({ name: 'home' })">Zu den Listen</AppButton>
  </AppCard>
</template>

<style scoped>
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.muted {
  color: var(--text-muted);
}
.error {
  color: var(--error);
}
.link {
  overflow-wrap: anywhere;
  font-size: var(--font-size-sm);
}
</style>
