<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type * as Y from 'yjs'
import { createCollection, listCollections, setInCollection } from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import AppCheckbox from '@/ui/components/AppCheckbox.vue'
import AppTextField from '@/ui/components/AppTextField.vue'

/** Sammlungen des Bereichs, in denen das Rezept steht (2.6). */
const props = defineProps<{ library: Y.Doc; recipeId: string }>()
const version = ref(0)
watch(
  () => props.library,
  (doc, _old, onCleanup) => {
    const bump = () => version.value++
    doc.on('update', bump)
    onCleanup(() => doc.off('update', bump))
  },
  { immediate: true },
)
const collections = computed(() => (version.value, listCollections(props.library)))
const name = ref('')

function add() {
  if (!name.value.trim()) return
  const id = createCollection(props.library, name.value)
  setInCollection(props.library, id, props.recipeId, true)
  name.value = ''
}
</script>

<template>
  <section class="collections" aria-labelledby="collections-title">
    <h2 id="collections-title">Sammlungen</h2>
    <div class="list">
      <AppCheckbox
        v-for="c in collections"
        :key="c.id"
        :label="c.name"
        :model-value="c.recipeIds.includes(recipeId)"
        @update:model-value="(v: boolean) => setInCollection(library, c.id, recipeId, v)"
      />
    </div>
    <form class="add" @submit.prevent="add">
      <AppTextField v-model="name" label="Neue Sammlung" maxlength="60" />
      <AppButton type="submit" :disabled="!name.trim()">Anlegen</AppButton>
    </form>
  </section>
</template>

<style scoped>
.collections {
  margin-top: var(--space-8);
}
.list {
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--space-4);
}
.add {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  max-width: 28rem;
}
.add > :first-child {
  flex: 1;
}
</style>
