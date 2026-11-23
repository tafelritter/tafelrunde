<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
  keymap,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { yCollab } from 'y-codemirror.next'
import type * as Y from 'yjs'

/**
 * Cooklang-Editor auf CodeMirror 6, direkt am gemeinsamen `Y.Text`.
 *
 * CodeMirror legt seine Styles als `<style>`-Element an – das verbietet die
 * CSP. In einem Shadow Root nimmt es stattdessen Constructable Stylesheets,
 * die erlaubt sind. Deshalb lebt der Editor in einem Shadow Root; die
 * Design-Tokens (CSS-Variablen) erben sich hinein.
 */
const props = defineProps<{
  text: Y.Text
  label: string
  /** Namen nicht auflösbarer Referenzen – werden im Text markiert. */
  unresolved?: readonly string[]
}>()
const emit = defineEmits<{ change: [] }>()
defineExpose({ insert, focus })

const host = ref<HTMLDivElement>()
let view: EditorView | undefined

// --- Hervorhebung -------------------------------------------------------------

const mark = (cls: string) => Decoration.mark({ class: cls })
const syntax = new MatchDecorator({
  regexp:
    /(^---$[\s\S]*?^---$)|(^==.*==\s*$)|(^>.*$)|(--.*$)|(@[^@#~{}\n]*\{[^}\n]*\}(\([^)\n]*\))?|@[\p{L}\p{N}_-]+)|(#[^@#~{}\n]*\{[^}\n]*\}|#[\p{L}\p{N}_-]+)|(~[^@#~{}\n]*\{[^}\n]*\})/gmu,
  decoration: (m) =>
    mark(
      m[1]
        ? 'cm-ck-meta'
        : m[2]
          ? 'cm-ck-section'
          : m[3]
            ? 'cm-ck-note'
            : m[4]
              ? 'cm-ck-comment'
              : m[5]
                ? 'cm-ck-ingredient'
                : m[7]
                  ? 'cm-ck-cookware'
                  : 'cm-ck-timer',
    ),
})
const highlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(v: EditorView) {
      this.decorations = syntax.createDeco(v)
    }
    update(u: ViewUpdate) {
      this.decorations = syntax.updateDeco(u, this.decorations)
    }
  },
  { decorations: (v) => v.decorations },
)

// --- Fehler direkt im Text: nicht auflösbare Referenzen ------------------------------

const setUnresolved = StateEffect.define<readonly string[]>()
const unresolvedField = StateField.define<{ names: readonly string[]; deco: DecorationSet }>({
  create: () => ({ names: [], deco: Decoration.none }),
  update(value, tr) {
    let names = value.names
    for (const e of tr.effects) if (e.is(setUnresolved)) names = e.value
    if (names === value.names && !tr.docChanged) return value
    const builder = new RangeSetBuilder<Decoration>()
    if (names.length) {
      const text = tr.state.doc.toString()
      const re = /@\.\/([^{\n]+)\{/g
      for (const m of text.matchAll(re)) {
        const name = m[1]!.trim().replace(/\.cook$/, '')
        if (names.includes(name)) {
          builder.add(
            m.index,
            m.index + m[0].length - 1,
            Decoration.mark({
              class: 'cm-ck-error',
              attributes: { title: 'Rezept nicht gefunden' },
            }),
          )
        }
      }
    }
    return { names, deco: builder.finish() }
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
})

const theme = EditorView.theme({
  '&': {
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '1rem',
  },
  '&.cm-focused': { outline: 'var(--focus-ring)', outlineOffset: 'var(--focus-offset)' },
  '.cm-content': {
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    padding: 'var(--space-3)',
    minHeight: '18rem',
    caretColor: 'var(--text)',
  },
  '.cm-line': { lineHeight: '1.6' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    background: 'color-mix(in srgb, var(--primary) 30%, transparent)',
  },
  '.cm-ck-meta': { color: 'var(--text-muted)' },
  '.cm-ck-section': { fontWeight: '700' },
  '.cm-ck-note, .cm-ck-comment': { color: 'var(--text-muted)', fontStyle: 'italic' },
  '.cm-ck-ingredient': { color: 'var(--accent-text)', fontWeight: '600' },
  '.cm-ck-cookware': { color: 'var(--primary)', fontStyle: 'italic' },
  '.cm-ck-timer': { color: 'var(--primary)', fontWeight: '600' },
  '.cm-ck-error': {
    textDecoration: 'underline wavy var(--error)',
    textDecorationSkipInk: 'none',
  },
})

onMounted(() => {
  const shadow = host.value!.attachShadow({ mode: 'open' })
  view = new EditorView({
    parent: shadow,
    root: shadow,
    state: EditorState.create({
      doc: props.text.toJSON(),
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          'aria-label': props.label,
          'aria-multiline': 'true',
          spellcheck: 'true',
          lang: 'de',
        }),
        highlight,
        unresolvedField,
        theme,
        yCollab(props.text, null),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) emit('change')
        }),
      ],
    }),
  })
  view.dispatch({ effects: setUnresolved.of(props.unresolved ?? []) })
})

watch(
  () => props.unresolved,
  (names) => view?.dispatch({ effects: setUnresolved.of(names ?? []) }),
)

onBeforeUnmount(() => view?.destroy())

/** Text an der Cursorposition einfügen (Einfügehilfen). */
function insert(snippet: string) {
  if (!view) return
  const { from, to } = view.state.selection.main
  view.dispatch({
    changes: { from, to, insert: snippet },
    selection: { anchor: from + snippet.length },
    scrollIntoView: true,
  })
  view.focus()
}

function focus() {
  view?.focus()
}
</script>

<template>
  <div ref="host" class="editor"></div>
</template>

<style scoped>
.editor {
  display: block;
}
</style>
