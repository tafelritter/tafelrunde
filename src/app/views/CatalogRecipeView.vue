<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { createRecipe, spaceKind, spaceName } from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import {
  catalogImages,
  catalogSources,
  catalogVersions,
  loadCatalogRecipes,
} from '../recipes/catalog-recipes'
import { catalogEntries, useRecipes } from '../recipes/recipe-store'
import { workspace } from '../workspace/use-workspace'
import type { Workspace } from '../workspace/workspace'
import RecipeView from './RecipeView.vue'

/** Rezept aus dem öffentlichen Katalog, mit Übernahme als eigene Kopie (2.11). */
const props = defineProps<{ path: string | string[] }>()
const router = useRouter()
const { handles } = useRecipes()
const ws = shallowRef<Workspace>()
onMounted(async () => {
  ws.value = await workspace()
  await loadCatalogRecipes()
})

const path = computed(() => (Array.isArray(props.path) ? props.path.join('/') : props.path))
const entry = computed(() => catalogEntries.value.find((e) => e.path === path.value))
const targets = computed(() =>
  handles.value
    .filter((h) => spaceKind(h.doc) === 'personal' || spaceKind(h.doc) === 'household')
    .map((h) => ({
      id: h.record.id,
      name: spaceName(h.doc) || (spaceKind(h.doc) === 'personal' ? 'Persönlich' : 'Bereich'),
    })),
)
const target = ref<string>()

async function adopt() {
  const h = handles.value.find((x) => x.record.id === (target.value ?? targets.value[0]?.id))
  const source = catalogSources.value.get(path.value)
  if (!h?.library || !ws.value?.profile || source === undefined) return
  const id = createRecipe(h.library.doc, source, ws.value.profile.personId, Date.now(), {
    kind: 'catalog',
    ref: path.value,
    version: catalogVersions.value.get(path.value) ?? '',
  })
  await router.push({ name: 'recipe', params: { spaceId: h.record.id, recipeId: id } })
}
</script>

<template>
  <RecipeView v-if="entry" :entry="entry" :image-url="catalogImages.get(path)">
    <template #actions>
      <form class="adopt" @submit.prevent="adopt">
        <div v-if="targets.length > 1" class="field">
          <label for="adopt-target">Übernehmen nach</label>
          <select id="adopt-target" v-model="target">
            <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <AppButton type="submit" :disabled="!targets.length">In meine Rezepte übernehmen</AppButton>
      </form>
    </template>
  </RecipeView>
  <p v-else>Rezept wird geladen …</p>
  <p class="muted">Aus dem öffentlichen Katalog, Lizenz CC BY-SA 4.0.</p>
</template>

<style scoped>
.adopt {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2);
}
.field {
  display: grid;
  gap: var(--space-1);
}
.field label {
  font-weight: 600;
}
select {
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.muted {
  color: var(--text-muted);
}
</style>
