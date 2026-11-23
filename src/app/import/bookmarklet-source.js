/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Tafelrunde-Bookmarklet (plan/06-phase-4-import-naehrwerte.md, 4.2).
 * Läuft auf der Rezeptseite: liest schema.org/Recipe (JSON-LD, sonst Microdata,
 * sonst den markierten Text), öffnet Tafelrunde und übergibt die Daten per
 * postMessage – nur an die Herkunft der App und erst, wenn sie sich meldet.
 * Es lädt nichts nach und schickt nichts an andere Stellen.
 */
;(function () {
  var APP = '__APP_URL__'
  var ORIGIN = new URL(APP).origin
  var blocks = []
  var scripts = document.querySelectorAll('script[type="application/ld+json"]')
  for (var i = 0; i < scripts.length && i < 20; i++) {
    blocks.push(String(scripts[i].textContent || '').slice(0, 500000))
  }
  var root = document.querySelector('[itemtype*="schema.org/Recipe"]')
  if (root) {
    var micro = { '@type': 'Recipe' }
    var lists = {
      recipeIngredient: 1,
      ingredients: 1,
      recipeInstructions: 1,
      keywords: 1,
      recipeYield: 1,
    }
    var props = root.querySelectorAll('[itemprop]')
    for (var j = 0; j < props.length && j < 500; j++) {
      var el = props[j]
      var key = el.getAttribute('itemprop')
      var value = el.getAttribute('content') || el.getAttribute('datetime') || el.textContent || ''
      value = String(value).replace(/\s+/g, ' ').trim().slice(0, 5000)
      if (!key || !value) continue
      if (lists[key]) (micro[key] = micro[key] || []).push(value)
      else if (!(key in micro)) micro[key] = value
    }
    blocks.push(JSON.stringify(micro))
  }
  var data = {
    type: 'tafelrunde-import',
    version: 1,
    url: location.href,
    title: document.title,
    blocks: blocks,
    text: String(window.getSelection() || '').slice(0, 100000),
  }
  var win = window.open(APP + '#/import?quelle=bookmarklet', 'tafelrunde-import')
  if (!win) {
    alert('Tafelrunde konnte nicht geöffnet werden. Bitte Pop-ups für diese Seite erlauben.')
    return
  }
  function onMessage(event) {
    if (event.origin !== ORIGIN || event.source !== win) return
    if (!event.data || event.data.type !== 'tafelrunde-ready') return
    window.removeEventListener('message', onMessage)
    win.postMessage(data, ORIGIN)
  }
  window.addEventListener('message', onMessage)
  setTimeout(function () {
    window.removeEventListener('message', onMessage)
  }, 60000)
})()
