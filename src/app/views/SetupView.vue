<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import AppTextField from '@/ui/components/AppTextField.vue'
import { bumpWorkspace, workspace } from '../workspace/use-workspace'

const route = useRoute()
const router = useRouter()
const person = ref('')
const deviceName = ref(guessDeviceName())
const error = ref<string>()
const busy = ref(false)

function guessDeviceName(): string {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'Android-Handy'
  if (/iPhone|iPad/i.test(ua)) return 'iPhone'
  if (/Windows/i.test(ua)) return 'Windows-PC'
  if (/Mac/i.test(ua)) return 'Mac'
  return 'Computer'
}

/** Nur App-interne Ziele zulassen (kein Open Redirect). */
function target(): string {
  const next = route.query.weiter
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

onMounted(async () => {
  if ((await workspace()).profile) await router.replace(target())
})

async function submit() {
  error.value = undefined
  if (!person.value.trim()) {
    error.value = 'Bitte gib deinen Namen ein.'
    return
  }
  busy.value = true
  try {
    await (await workspace()).setup(person.value, deviceName.value || guessDeviceName())
    bumpWorkspace()
    await router.replace(target())
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h1>Willkommen bei Tafelrunde</h1>
  <AppCard>
    <p>
      Rezepte, Wochenplan und geteilte Einkaufslisten – Ende-zu-Ende verschlüsselt, ohne Server.
      Deine Daten liegen nur auf deinen Geräten und in deinem eigenen Speicher.
    </p>
    <form class="stack" novalidate @submit.prevent="submit">
      <AppTextField
        v-model="person"
        label="Dein Name"
        hint="So sehen dich die anderen im Haushalt."
        autocomplete="given-name"
        :error="error"
        required
      />
      <AppTextField
        v-model="deviceName"
        label="Name dieses Geräts"
        hint="Hilft, Geräte später auseinanderzuhalten."
      />
      <div>
        <AppButton type="submit" variant="primary" :disabled="busy">Los geht’s</AppButton>
      </div>
    </form>
  </AppCard>
</template>

<style scoped>
.stack {
  display: grid;
  gap: var(--space-4);
}
</style>
