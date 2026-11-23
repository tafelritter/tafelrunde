<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  type ImportedRecipe,
  type RecipeDraft,
  MAX_IMPORT_CHARS,
  createRecipe,
  draftCooklang,
  parseRecipe,
  parseRecipeText,
  recipeFromJsonLd,
  toPlanDate,
} from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import { catalogItem } from '../catalog'
import { bookmarkletHref, bookmarkletSource, readBookmarkletMessage } from '../import/bookmarklet'
import { consumeShared } from '../import/incoming'
import { planSpaces } from '../plan/plan-helpers'
import { useRecipes } from '../recipes/recipe-store'
import { workspace } from '../workspace/use-workspace'

/**
 * Rezept-Import (plan/06-phase-4-import-naehrwerte.md, Teil A): per Bookmarklet,
 * über das Teilen-Menü oder durch Einfügen. Vor dem Speichern gibt es immer
 * eine Prüfansicht; gespeichert wird ein bearbeitbarer Entwurf.
 */
const route = useRoute()
const router = useRouter()
const { handles } = useRecipes()

const text = ref('')
const imported = shallowRef<ImportedRecipe>()
const draft = shallowRef<RecipeDraft>()
const source = ref('')
const status = ref<string>()
const onlyUrl = ref(false)

function makeDraft(recipe: ImportedRecipe) {
  imported.value = recipe
  draft.value = draftCooklang(recipe, {
    importedAt: toPlanDate(new Date()),
    catalog: (name) => catalogItem(name),
  })
  source.value = draft.value.source
}

function fromText(input: string, title = '', url = '') {
  const result = parseRecipeText(input, title, url)
  onlyUrl.value = result.onlyUrl
  if (result.onlyUrl) {
    imported.value = undefined
    draft.value = undefined
    return
  }
  makeDraft(result.recipe)
}

function submitText() {
  if (text.value.trim()) fromText(text.value)
}

// --- Bookmarklet (4.2) ----------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined
function onMessage(event: MessageEvent) {
  // Nur vom Fenster, das diese Seite geöffnet hat (der Rezeptseite mit dem Bookmarklet).
  if (!window.opener || event.source !== window.opener) return
  const data = readBookmarkletMessage(event.data)
  if (!data) return
  window.removeEventListener('message', onMessage)
  clearTimeout(timer)
  status.value = undefined
  const recipe = recipeFromJsonLd(data.blocks, data.url)
  if (recipe) makeDraft(recipe)
  else if (data.text.trim()) fromText(data.text, data.title, data.url)
  else
    status.value =
      'Auf der Seite wurde kein Rezept gefunden. Markiere den Rezepttext und klicke das Lesezeichen erneut – oder füge den Text unten ein.'
}

onMounted(() => {
  const shared = consumeShared()
  if (shared) fromText(shared.text, shared.title, shared.url)
  if (route.query.quelle === 'bookmarklet' && window.opener) {
    status.value = 'Warte auf die Rezeptseite …'
    window.addEventListener('message', onMessage)
    // Die Rezeptseite antwortet erst, wenn sich die App meldet. Die Meldung enthält keine Daten.
    ;(window.opener as Window).postMessage({ type: 'tafelrunde-ready' }, '*')
    timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      status.value =
        'Von der Rezeptseite kam nichts an. Manche Seiten verhindern das – dann bitte den Rezepttext kopieren und unten einfügen.'
    }, 8000)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  clearTimeout(timer)
})

// --- Prüfen und Speichern -----------------------------------------------------------

const preview = computed(() => (source.value ? parseRecipe(source.value) : undefined))
const targets = computed(() => planSpaces(handles.value))
const target = ref<string>()
const error = ref<string>()

async function save() {
  error.value = undefined
  const h = handles.value.find((x) => x.record.id === (target.value ?? targets.value[0]?.id))
  const ws = await workspace()
  if (!h?.library || !ws.profile) {
    error.value = 'Kein Bereich für Rezepte gefunden.'
    return
  }
  const id = createRecipe(h.library.doc, source.value, ws.profile.personId)
  await router.push({ name: 'recipe-edit', params: { spaceId: h.record.id, recipeId: id } })
}

function discard() {
  imported.value = undefined
  draft.value = undefined
  source.value = ''
}

const href = bookmarkletHref()
</script>

<template>
  <h1>Rezept importieren</h1>
  <p class="notice">
    Nur für den privaten Gebrauch: Importierte Rezepte gehören nicht in den öffentlichen Katalog,
    solange die Rechte nicht geklärt sind. Bilder werden nicht übernommen.
  </p>

  <p v-if="status" role="status" class="status">{{ status }}</p>
  <p v-if="onlyUrl" role="alert" class="status">
    Es wurde nur eine Adresse geteilt. Bitte auf der Seite den Rezepttext markieren und teilen –
    oder ihn hier einfügen.
  </p>

  <template v-if="draft && imported && preview">
    <h2>Entwurf prüfen</h2>
    <ul class="facts">
      <li>
        <strong>{{ preview.meta.title }}</strong>
      </li>
      <li v-if="preview.meta.servings">{{ preview.meta.servings }} Portionen</li>
      <li v-if="preview.meta.prepMinutes || preview.meta.cookMinutes">
        {{ (preview.meta.prepMinutes ?? 0) + (preview.meta.cookMinutes ?? 0) }} min
      </li>
      <li v-if="imported.source">
        Quelle:
        <a :href="imported.source" rel="noopener noreferrer" target="_blank">{{
          imported.source
        }}</a>
      </li>
    </ul>

    <table class="ingredients">
      <caption>
        Erkannte Zutaten
      </caption>
      <thead>
        <tr>
          <th scope="col">Zeile</th>
          <th scope="col">Erkannt</th>
          <th scope="col">Katalog</th>
          <th scope="col">Platz</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(i, n) in draft.ingredients" :key="n">
          <td>{{ i.line }}</td>
          <td>
            {{ [i.quantity, i.unit].filter(Boolean).join(' ') }} <strong>{{ i.name }}</strong>
            <span v-if="i.note" class="muted"> ({{ i.note }})</span>
            <span v-if="i.optional" class="muted"> optional</span>
          </td>
          <td>{{ i.catalog ? i.catalog.name : '–' }}</td>
          <td>{{ i.placed ? 'im Schritt' : 'Abschnitt „Zutaten“' }}</td>
        </tr>
      </tbody>
    </table>

    <div class="field">
      <label for="import-source">Cooklang-Entwurf</label>
      <textarea id="import-source" v-model="source" rows="14" spellcheck="false" />
      <small class="muted">Nach dem Speichern geht es im Editor weiter.</small>
    </div>
    <ul v-if="preview.warnings.length" class="warnings" aria-label="Hinweise zum Entwurf">
      <li v-for="w in preview.warnings" :key="w">{{ w }}</li>
    </ul>

    <div class="actions">
      <div v-if="targets.length > 1" class="field">
        <label for="import-target">Speichern in</label>
        <select id="import-target" v-model="target">
          <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
      <AppButton variant="primary" :disabled="!targets.length" @click="save">
        Als Entwurf speichern
      </AppButton>
      <AppButton @click="discard">Verwerfen</AppButton>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
  </template>

  <template v-else>
    <form class="paste" @submit.prevent="submitText">
      <div class="field">
        <label for="import-text">Rezepttext einfügen</label>
        <textarea
          id="import-text"
          v-model="text"
          rows="10"
          :maxlength="MAX_IMPORT_CHARS"
          placeholder="Titel, Zutaten und Zubereitung – zum Beispiel von einer Rezeptseite kopiert."
        />
      </div>
      <div>
        <AppButton type="submit" variant="primary" :disabled="!text.trim()">
          Entwurf erstellen
        </AppButton>
      </div>
    </form>

    <section class="bookmarklet" aria-labelledby="bookmarklet-title">
      <h2 id="bookmarklet-title">Mit einem Klick von der Rezeptseite</h2>
      <p>
        Am Desktop: Ziehe diesen Link in deine Lesezeichenleiste. Auf einer Rezeptseite klickst du
        dann darauf, und Tafelrunde öffnet den Entwurf.
      </p>
      <p>
        <a class="bookmarklet__link" :href="href" @click.prevent>Zu Tafelrunde</a>
      </p>
      <p class="muted">
        Unter Android: Rezepttext markieren, „Teilen“ wählen und Tafelrunde antippen (die App muss
        installiert sein).
      </p>
      <details>
        <summary>Was das Lesezeichen tut</summary>
        <p>
          Es liest die strukturierten Rezeptdaten der Seite (schema.org) oder den markierten Text,
          öffnet Tafelrunde und übergibt sie nur an diese App. Es lädt nichts nach und sendet nichts
          an andere Stellen.
        </p>
        <pre class="source">{{ bookmarkletSource }}</pre>
      </details>
    </section>
  </template>
</template>

<style scoped>
.notice,
.status {
  padding: var(--space-2) var(--space-3);
  border-left: 4px solid var(--primary);
  background: var(--surface);
}
.status {
  border-left-color: var(--warning);
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  padding: 0;
  list-style: none;
}
.facts a {
  overflow-wrap: anywhere;
}
.ingredients {
  width: 100%;
  margin: var(--space-4) 0;
  border-collapse: collapse;
}
.ingredients caption {
  text-align: left;
  font-weight: 600;
  padding-bottom: var(--space-2);
}
.ingredients th,
.ingredients td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
.paste {
  display: grid;
  gap: var(--space-3);
}
.field {
  display: grid;
  gap: var(--space-1);
}
.field label {
  font-weight: 600;
}
textarea,
select {
  width: 100%;
  min-height: var(--touch-target);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  box-sizing: border-box;
}
#import-source {
  font-family: ui-monospace, monospace;
  font-size: var(--font-size-sm);
}
.warnings {
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-6);
  border-left: 4px solid var(--warning);
  background: var(--surface);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.bookmarklet {
  margin-top: var(--space-8);
}
.bookmarklet__link {
  display: inline-block;
  padding: var(--space-2) var(--space-4);
  border: 2px dashed var(--primary);
  border-radius: var(--radius-sm);
  font-weight: 600;
  cursor: grab;
}
.source {
  max-height: 20rem;
  overflow: auto;
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
}
.muted {
  color: var(--text-muted);
}
.error {
  color: var(--error);
}
</style>
