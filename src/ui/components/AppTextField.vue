<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, useAttrs, useId } from 'vue'

// Attribute wie maxlength oder list gehören ans Eingabefeld, class und style an den Rahmen.
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  void _class
  void _style
  return rest
})
const rootStyle = computed(() => attrs.style as string | undefined)

const props = defineProps<{
  label: string
  hint?: string | undefined
  error?: string | undefined
}>()
const model = defineModel<string>({ default: '' })
const id = useId()
const describedBy = computed(() =>
  [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' '),
)
</script>

<template>
  <div :class="['field', attrs.class]" :style="rootStyle">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      v-bind="inputAttrs"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy || undefined"
    />
    <small v-if="hint" :id="`${id}-hint`" class="field__hint">{{ hint }}</small>
    <small v-if="error" :id="`${id}-error`" class="field__error">{{ error }}</small>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}
label {
  font-weight: 600;
}
input {
  width: 100%;
  min-width: 0;
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
input[aria-invalid='true'] {
  border-color: var(--error);
}
.field__hint {
  color: var(--text-muted);
}
.field__error {
  color: var(--error);
}
</style>
