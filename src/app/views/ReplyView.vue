<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { type JoinReply, decodeCode } from '@/core/base'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import { workspace } from '../workspace/use-workspace'

/** Antwort-Code eines neuen Geräts als Link geöffnet. */
const props = defineProps<{ code: string }>()
const router = useRouter()

const reply = computed<JoinReply | undefined>(() => {
  try {
    const code = decodeCode(props.code)
    return code.type === 'reply' ? code : undefined
  } catch {
    return undefined
  }
})
const error = ref<string>()

async function accept() {
  if (!reply.value) return
  try {
    const ws = await workspace()
    if (!ws.hasSpace(reply.value.spaceId))
      throw new Error('Dieser Bereich ist auf diesem Gerät nicht vorhanden.')
    await ws.acceptReply(reply.value)
    await router.replace({ name: 'space', params: { spaceId: reply.value.spaceId } })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
</script>

<template>
  <h1>Antwort-Code</h1>
  <AppCard v-if="reply">
    <p>
      <strong>{{ reply.person }}</strong> ({{ reply.deviceName || 'Gerät' }}) möchte mitmachen. Nur
      annehmen, wenn du diese Person gerade eingeladen hast.
    </p>
    <div class="row">
      <AppButton variant="primary" @click="accept">Aufnehmen</AppButton>
      <AppButton @click="router.replace({ name: 'home' })">Abbrechen</AppButton>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </AppCard>
  <AppCard v-else>
    <p role="alert">Dieser Antwort-Code ist ungültig.</p>
  </AppCard>
</template>

<style scoped>
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.error {
  color: var(--error);
}
</style>
