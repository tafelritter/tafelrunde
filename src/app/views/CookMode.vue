<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { type ParsedRecipe, formatAmount, timerSeconds } from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import TimerButton from '@/ui/components/TimerButton.vue'

/** Kochmodus: ein Schritt je Seite, große Schrift, Bildschirm bleibt an. */
const props = defineProps<{ recipe: ParsedRecipe }>()
const emit = defineEmits<{ close: [] }>()

const steps = computed(() =>
  props.recipe.sections.flatMap((section) =>
    section.blocks.flatMap((block) =>
      block.type === 'step' ? [{ section: section.name, block }] : [],
    ),
  ),
)
const current = ref(0)
const step = computed(() => steps.value[current.value])
const stepIngredients = computed(() =>
  (step.value?.block.tokens ?? []).flatMap((t) =>
    t.type === 'ingredient' && props.recipe.ingredients[t.index]
      ? [props.recipe.ingredients[t.index]!]
      : [],
  ),
)

const dialog = ref<HTMLDialogElement>()
let wakeLock: { release(): Promise<void> } | undefined
const wakeLockFailed = ref(false)

async function keepAwake() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> }
    }
    wakeLock = await nav.wakeLock?.request('screen')
    if (!nav.wakeLock) wakeLockFailed.value = true
  } catch {
    wakeLockFailed.value = true
  }
}

// Nach dem Zurückkehren in die App muss die Sperre neu angefordert werden.
const onVisibility = () => {
  if (document.visibilityState === 'visible') void keepAwake()
}

onMounted(() => {
  dialog.value?.showModal()
  void keepAwake()
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  void wakeLock?.release()
})

function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowRight')
    current.value = Math.min(current.value + 1, steps.value.length - 1)
  if (event.key === 'ArrowLeft') current.value = Math.max(current.value - 1, 0)
}
</script>

<template>
  <dialog
    ref="dialog"
    class="cook"
    aria-labelledby="cook-title"
    @close="emit('close')"
    @keydown="onKey"
  >
    <header class="cook__head">
      <h2 id="cook-title">{{ recipe.meta.title }}</h2>
      <AppButton @click="dialog?.close()">Schließen</AppButton>
    </header>
    <p class="cook__progress" aria-live="polite">
      Schritt {{ current + 1 }} von {{ steps.length }}
      <template v-if="step?.section"> · {{ step.section }}</template>
    </p>
    <ul
      v-if="stepIngredients.length"
      class="cook__ingredients"
      aria-label="Zutaten für diesen Schritt"
    >
      <li v-for="(i, n) in stepIngredients" :key="n">
        <strong>{{ formatAmount(i.amount) }}</strong> {{ i.name }}
      </li>
    </ul>
    <p v-if="step" class="cook__text">
      <template v-for="(t, k) in step.block.tokens" :key="k">
        <template v-if="t.type === 'text'">{{ t.text }}</template>
        <strong v-else-if="t.type === 'ingredient'" class="ing">{{ t.display }}</strong>
        <em v-else-if="t.type === 'cookware'">{{ t.name }}</em>
        <TimerButton
          v-else-if="recipe.timers[t.index]"
          :label="formatAmount(recipe.timers[t.index]!.amount)"
          :seconds="timerSeconds(recipe.timers[t.index]!.amount)"
          :name="recipe.timers[t.index]!.name"
        />
      </template>
    </p>
    <p v-if="wakeLockFailed" class="cook__hint">
      Dieser Browser kann den Bildschirm nicht wach halten.
    </p>
    <nav class="cook__nav" aria-label="Schritte">
      <AppButton :disabled="current === 0" @click="current--">Zurück</AppButton>
      <AppButton variant="primary" :disabled="current >= steps.length - 1" @click="current++">
        Weiter
      </AppButton>
    </nav>
  </dialog>
</template>

<style scoped>
.cook {
  width: 100vw;
  max-width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0;
  padding: var(--space-4);
  border: 0;
  background: var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.cook:not([open]) {
  display: none;
}
.cook__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.cook__head h2 {
  margin: 0;
}
.cook__progress {
  margin: 0;
  color: var(--text-muted);
}
.cook__ingredients {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-lg);
}
.cook__text {
  flex: 1;
  margin: 0;
  font-size: clamp(1.375rem, 4vw, 2rem);
  line-height: 1.5;
  overflow-y: auto;
}
.ing {
  color: var(--accent-text);
}
.cook__hint {
  color: var(--text-muted);
}
.cook__nav {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}
.cook__nav :deep(button) {
  flex: 1;
  min-height: 3.5rem;
  font-size: var(--font-size-lg);
}
</style>
