<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import SyncStatus from '@/ui/components/SyncStatus.vue'
import ThemeSwitch from '@/ui/components/ThemeSwitch.vue'
import UpdatePrompt from './UpdatePrompt.vue'
import ConnectButton from './ConnectButton.vue'
import { computed, onMounted, shallowRef } from 'vue'
import type { Workspace } from './workspace/workspace'
import { activeSpaceId, useSpace } from './workspace/use-space'
import { workspace, workspaceVersion } from './workspace/use-workspace'

// Kopfzeile zeigt den Sync-Status des gerade geöffneten Bereichs, sonst des persönlichen.
const ws = shallowRef<Workspace>()
onMounted(async () => (ws.value = await workspace()))
const shownSpace = computed(() => {
  void workspaceVersion.value
  return activeSpaceId.value ?? ws.value?.personalSpace()?.id
})
const { snapshot } = useSpace(shownSpace)
const lastSync = computed(() =>
  snapshot.value?.lastSyncAt ? new Date(snapshot.value.lastSyncAt) : undefined,
)
</script>

<template>
  <a class="skip-link" href="#main">Zum Inhalt springen</a>
  <header class="app-header">
    <RouterLink to="/" class="brand">Tafelrunde</RouterLink>
    <nav class="app-nav" aria-label="Hauptmenü">
      <RouterLink to="/">Einkauf</RouterLink>
      <RouterLink to="/plan">Plan</RouterLink>
      <RouterLink to="/rezepte">Rezepte</RouterLink>
    </nav>
    <div class="app-header__tools">
      <SyncStatus :state="snapshot?.status ?? 'local'" :last-sync="lastSync" />
      <ConnectButton />
      <ThemeSwitch />
    </div>
  </header>
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
  <UpdatePrompt />
</template>

<style scoped>
.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.app-header__tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-3);
}
.app-nav {
  display: flex;
  gap: var(--space-4);
  margin-right: auto;
}
.app-nav a {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}
.app-nav a.router-link-exact-active,
.app-nav a[aria-current='page'] {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 0.3em;
}
.brand {
  font-weight: 700;
  font-size: var(--font-size-lg);
  color: var(--primary);
  text-decoration: none;
}
main {
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--space-4);
}
main:focus {
  outline: none;
}
</style>
