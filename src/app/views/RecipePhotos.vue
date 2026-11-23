<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { type PhotoRef, listPhotos } from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import { imageType, resizeImage } from '../recipes/image'
import { useRecipes } from '../recipes/recipe-store'
import { workspace } from '../workspace/use-workspace'

/** Fotos eines Rezepts (2.9): verschlüsselt gespeichert, lokal zwischengespeichert. */
const props = defineProps<{ spaceId: string; recipeId: string; title: string; editable: boolean }>()
const { handles } = useRecipes()
const handle = computed(() => handles.value.find((h) => h.record.id === props.spaceId))

const version = ref(0)
watch(
  handle,
  (h, _old, onCleanup) => {
    if (!h?.library) return
    const bump = () => version.value++
    h.library.doc.on('update', bump)
    onCleanup(() => h.library?.doc.off('update', bump))
  },
  { immediate: true },
)
const refs = computed<PhotoRef[]>(() => {
  void version.value
  return handle.value?.library ? listPhotos(handle.value.library.doc, props.recipeId) : []
})

/** Objekt-URLs je Foto; werden beim Verlassen freigegeben. */
const urls = shallowRef(new Map<string, string>())
const failed = ref(new Set<string>())
watch(
  refs,
  async (list) => {
    const ws = await workspace()
    for (const p of list) {
      if (urls.value.has(p.id) || failed.value.has(p.id)) continue
      try {
        const bytes = await ws.loadPhoto(props.spaceId, p.id)
        const type = bytes && imageType(bytes)
        if (!bytes || !type) continue
        const next = new Map(urls.value)
        next.set(p.id, URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type })))
        urls.value = next
      } catch {
        failed.value = new Set([...failed.value, p.id])
      }
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  for (const url of urls.value.values()) URL.revokeObjectURL(url)
})

const busy = ref(false)
const error = ref<string>()
async function add(event: Event) {
  const input = event.target as HTMLInputElement
  error.value = undefined
  busy.value = true
  try {
    const ws = await workspace()
    for (const file of Array.from(input.files ?? [])) {
      const image = await resizeImage(file)
      await ws.addPhoto(props.spaceId, props.recipeId, image.bytes, image)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
    input.value = ''
  }
}

async function remove(id: string) {
  await (await workspace()).removePhoto(props.spaceId, id)
  const url = urls.value.get(id)
  if (url) URL.revokeObjectURL(url)
  const next = new Map(urls.value)
  next.delete(id)
  urls.value = next
}
</script>

<template>
  <section v-if="refs.length || editable" class="photos" aria-label="Fotos">
    <ul v-if="refs.length" class="grid">
      <li v-for="(p, n) in refs" :key="p.id" :class="{ cover: n === 0 }">
        <img
          v-if="urls.get(p.id)"
          :src="urls.get(p.id)"
          :alt="`${title}, Foto ${n + 1}`"
          :width="p.width || undefined"
          :height="p.height || undefined"
          loading="lazy"
        />
        <span v-else class="placeholder">
          {{
            failed.has(p.id)
              ? 'Foto nicht verfügbar'
              : p.fileId
                ? 'Foto wird geladen …'
                : 'Foto liegt auf einem anderen Gerät'
          }}
        </span>
        <AppButton v-if="editable" variant="ghost" @click="remove(p.id)">
          Entfernen<span class="visually-hidden">: Foto {{ n + 1 }}</span>
        </AppButton>
      </li>
    </ul>
    <label v-if="editable" class="file-button">
      {{ busy ? 'Foto wird verarbeitet …' : 'Foto hinzufügen' }}
      <input type="file" accept="image/*" :disabled="busy" @change="add" />
    </label>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </section>
</template>

<style scoped>
.photos {
  margin: var(--space-4) 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  padding: 0;
  list-style: none;
}
.grid li {
  display: grid;
  gap: var(--space-1);
}
.grid .cover {
  grid-column: 1 / -1;
}
img {
  width: 100%;
  height: auto;
  max-height: 28rem;
  object-fit: cover;
  border-radius: var(--radius-md);
  background: var(--surface);
}
.placeholder {
  display: grid;
  place-items: center;
  min-height: 6rem;
  padding: var(--space-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
}
.file-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target);
  padding: 0 var(--space-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-weight: 600;
  cursor: pointer;
}
.file-button:focus-within {
  outline: var(--focus-ring);
  outline-offset: var(--focus-offset);
}
.file-button input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.error {
  color: var(--error);
}
</style>
