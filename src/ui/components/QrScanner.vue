<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AppButton from './AppButton.vue'

/**
 * QR-Code mit der Kamera lesen. Nutzt den eingebauten `BarcodeDetector`
 * (Chrome auf Android); ohne ihn wird der Knopf nicht angezeigt und man
 * fügt den Link ein.
 */
const emit = defineEmits<{ detected: [value: string] }>()

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (options: { formats: string[] }) => Detector

const Ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
const supported = !!Ctor && !!navigator.mediaDevices?.getUserMedia
const active = ref(false)
const error = ref<string>()
const video = ref<HTMLVideoElement>()
let stream: MediaStream | undefined
let timer: ReturnType<typeof setTimeout> | undefined

async function start() {
  if (!Ctor) return
  error.value = undefined
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    active.value = true
    await Promise.resolve()
    const el = video.value
    if (!el) return
    el.srcObject = stream
    await el.play()
    const detector = new Ctor({ formats: ['qr_code'] })
    const scan = async () => {
      if (!active.value) return
      try {
        const [hit] = await detector.detect(el)
        if (hit?.rawValue) {
          stop()
          emit('detected', hit.rawValue)
          return
        }
      } catch {
        // Einzelbild nicht lesbar – weiter versuchen.
      }
      timer = setTimeout(() => void scan(), 250)
    }
    void scan()
  } catch {
    error.value = 'Kein Zugriff auf die Kamera. Du kannst den Link stattdessen einfügen.'
    stop()
  }
}

function stop() {
  active.value = false
  clearTimeout(timer)
  stream?.getTracks().forEach((t) => t.stop())
  stream = undefined
}

onBeforeUnmount(stop)
</script>

<template>
  <div v-if="supported" class="scanner">
    <AppButton v-if="!active" @click="start">QR-Code scannen</AppButton>
    <template v-else>
      <video ref="video" class="scanner__video" muted playsinline aria-label="Kamerabild"></video>
      <AppButton @click="stop">Scannen beenden</AppButton>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.scanner {
  display: grid;
  gap: var(--space-2);
  justify-items: start;
}
.scanner__video {
  width: min(20rem, 100%);
  border-radius: var(--radius-md);
  background: #000;
}
</style>
