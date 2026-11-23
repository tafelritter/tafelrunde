# ADR 0002 – UI-Grundlagen: Schrift, Bausteine, Kontraste

- **Status:** angenommen
- **Datum:** 2026-11-20

## Kontext

Phase 0 legt Schrift, Design-Tokens und Basis-Komponenten fest. Vorgaben: WCAG 2.2 AA, keine Fremd-Fonts, strikte CSP ohne `unsafe-inline`.

## Entscheidungen

### Schrift: Systemschrift

`system-ui` mit Rückfallfolge (`src/ui/tokens.css`). Gründe: keine zusätzliche Abhängigkeit oder Lizenzfrage, kein Download, vertraut auf jedem Gerät, gute Darstellung auf Android (Roboto) und Desktop. Eine selbst gehostete Schrift kann später ergänzt werden, ohne die Komponenten zu ändern.

### Bausteine: native Elemente, Reka UI erst bei Bedarf

Die Basis-Komponenten (Button, Eingabefeld, Checkbox, Listeneintrag, Karte, Badge, Toast, Dialog, Sync-Status) sind eigene, schlanke Vue-Komponenten auf nativen Elementen (`<button>`, `<input>`, `<dialog>`). Native Elemente bringen Tastaturbedienung und Semantik mit.

[Reka UI](https://reka-ui.com/) (MIT) wurde bewertet: barrierearm, headless, ohne Styles – passt zur CSP. Es wird eingesetzt, sobald Muster gebraucht werden, die nativ schwer barrierefrei sind (Combobox für die Zutatensuche, Menüs, Tabs). Bis dahin keine zusätzliche Abhängigkeit.

### Kontraste

Die Tokens aus dem Plan werden unverändert übernommen; `src/ui/tokens.test.ts` prüft alle relevanten Paare.

**Abweichung:** Abgehakte Einträge verwenden für den **Text** `--text-muted` (≥ 4,5:1) mit Durchstreichung; `--checked` (etwa 3:1) färbt nur die Durchstreichungslinie. Grund: Der axe-Test meldete 3,25:1 als Verstoß gegen WCAG 1.4.3 – abgehakte Einträge bleiben lesbarer Inhalt (z. B. zum Wiederherstellen).

## Folgen

- Keine UI-Bibliothek im Bundle, kleiner Start.
- Komponenten müssen selbst auf Barrierefreiheit geprüft werden (E2E mit axe, Hell und Dunkel).
