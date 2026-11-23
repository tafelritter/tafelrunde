# ADR 0003 – Cooklang-Parser

- **Status:** angenommen
- **Datum:** 2026-11-23

## Kontext

Rezepte werden in Cooklang geschrieben (plan/00-evaluation.md). Gebraucht werden Referenzen auf andere Rezepte, Skalierung, fixe Mengen, deutsche Schreibweisen und ein Parser, der in der App **und** im Katalog-Werkzeug (Node) läuft. Die CSP verbietet `unsafe-eval` und erlaubt kein `wasm-unsafe-eval`.

## Verglichen (Stand 2026-11-23)

| Kriterium                                | `@cooklang/cooklang` 0.19.1 (offiziell, Rust/WASM) | `@tmlmt/cooklang-parser` 2.1.8 (TypeScript)      |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| Lizenz                                   | MIT                                                | MIT (Abhängigkeit `big.js`: MIT)                 |
| Referenzen `@./Hefeteig{500%g}`          | ja                                                 | ja (`extras.path`)                               |
| Fixe Mengen `@Zimt{=1%Prise}`            | ja                                                 | ja                                               |
| Dezimalkomma `@Zwetschgen{1,5%kg}`       | nein – „1,5“ wird Text und skaliert nicht          | ja                                               |
| Abschnitte, Notizen, Timer, Kochgeschirr | ja                                                 | ja                                               |
| Fehlermeldungen                          | nachsichtig, keine Fehler bei kaputter Syntax      | nachsichtig; wirft bei nicht numerischem `yield` |
| Größe im Bundle                          | 1,2 MB WASM                                        | 28 KB minifiziert, 9 KB gzip                     |
| CSP                                      | braucht `wasm-unsafe-eval`                         | keine Änderung                                   |
| Pflege                                   | aktiv (cooklang-rs)                                | aktiv, Einzelperson                              |

## Entscheidung

`@tmlmt/cooklang-parser`, gekapselt in `src/core/recipe/recipe.ts`. Die App und `tools/` sehen nur das eigene Modell `ParsedRecipe`.

- Das **Front Matter liest Tafelrunde selbst** und gibt dem Parser nur den Rezepttext. So bleiben `yield: 800 g` und deutsche Dauern („1 h 30 min“) möglich, und ein Fehler im Front Matter wird zur Warnung statt zum Absturz.
- **Skalieren und Formatieren** übernimmt der eigene Code (`amount.ts`): einheitlich für Portionen und für Unterrezepte relativ zur Ausbeute, mit deutscher Zahlendarstellung und Einheitenwechsel (1500 g → 1,5 kg).
- Zeilenumbrüche innerhalb eines Schritts liefert der Parser ohne Leerzeichen; die Kapselung ergänzt es.

## Folgen

- Ein Wechsel des Parsers betrifft nur `recipe.ts`; die Tests in `recipe.test.ts` beschreiben das erwartete Verhalten.
- Risiko Einzelpflege: Der Parser ist klein und MIT-lizenziert; notfalls lässt er sich forken.
- Konventionen für Rezepte: `docs/rezepte.md`.
