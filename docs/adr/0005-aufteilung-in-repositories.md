# ADR 0005 – Aufteilung in drei Repositories

- **Status:** angenommen
- **Datum:** 2026-11-23
- **Ersetzt teilweise:** ADR 0003 (Ort des Parsers), ADR 0004 (Ort von `catalog/nutrition/` und Werkzeug)

## Kontext

App, öffentlicher Katalog (Rezepte, Artikel, Nährwerte) und das Rezeptformat lagen in einem Repository unter einem persönlichen Konto. Sie haben unterschiedliche Lizenzen (AGPL-3.0 für Code, CC BY-SA 4.0 für Inhalte), unterschiedliche Beitragende (Rezepte schreiben auch Menschen ohne Programmierkenntnisse) und unterschiedliche Rhythmen: Ein neues Rezept braucht kein App-Release. Das Projekt zieht in die Organisation **Tafelritter**.

## Entscheidung

| Repository                 | Inhalt                                                                                      | Lizenz                             |
| -------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- |
| `Tafelritter/tafelrunde`   | die App                                                                                     | AGPL-3.0-or-later                  |
| `Tafelritter/rezeptformat` | Cooklang-Parser, Mengen, Referenzen, Kategorien, Format des Artikelkatalogs, Katalogprüfung | AGPL-3.0-or-later                  |
| `Tafelritter/katalog`      | öffentliche Rezepte, Artikel, Fotos, Nährwerte                                              | CC BY-SA 4.0; BLS-Auszug CC BY 4.0 |

- **Ein Parser für alle:** `@tafelritter/rezeptformat` wird von App und Katalog genutzt. Es wird **per Git-Tag** installiert (kein npm-Registry, kein Token); `dist/` liegt im Repository, die CI prüft, dass es zum Quelltext passt. Zwei Einstiege: `/basis` ohne Parser (für den Start-Chunk der App) und der volle.
- **Katalog als Release:** Der Katalog baut bei jedem Release (release-please) ein Archiv `katalog-vX.Y.Z.tar.gz` mit genau den Dateien, die die App unter `catalog/` lädt, dazu SHA-256 und Build-Provenance. Die App pinnt Version und Prüfsumme in `katalog.json`; `tools/katalog.mjs` holt das Archiv beim Build, prüft es und entpackt es ohne Bibliothek. Kein Abruf zur Laufzeit, keine zweite Herkunft in der CSP.
- **Updates** schlägt Renovate vor: das Paket über den Git-Tag, den Katalog über Version und Digest in `katalog.json`.
- **Frische Historie** in allen drei Repositories; die Geschichte bis zur Aufteilung bleibt im bisherigen Repository `stefanniedermaier/tafelrunde`.

## Verworfen

- **Git-Submodule:** jeder Klon braucht `--recurse-submodules`, Updates über Zeiger-Commits sind fehleranfällig.
- **Katalog zur Laufzeit laden:** zweite Herkunft in der CSP und ein Abruf bei Dritten beim Start – gegen die Leitplanken.
- **npm-Registry für das Paket:** bräuchte eine npm-Organisation und ein Publish-Token in der CI.

## Folgen

- Ein **Formatwechsel** (Breaking Change im Rezeptformat) erhöht die Hauptversion des Pakets; zuerst den Katalog, dann die App umstellen. Die gebauten Dateien tragen `version` (Formatversion) und `katalog` (Release).
- Der Build der App braucht beim ersten Mal Netz zu `github.com` (Release-Download); danach liegt das Archiv im Cache unter `node_modules/.cache/`. Unveröffentlichte Kataloge testet man mit `KATALOG_DATEI=<archiv>`.
- Lockfiles von App und Katalog lassen sich erst erzeugen, wenn der Tag `v1.0.0` des Pakets existiert.
- Konventionen für Rezepte (`docs/rezepte.md`) und das Werkzeug `bls-extract.py` liegen jetzt im Katalog.
