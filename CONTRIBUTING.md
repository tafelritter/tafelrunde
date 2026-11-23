# Mitmachen

Danke für dein Interesse! Beiträge sind willkommen – Code, Rezepte, Zutaten und Hinweise.

## Grundregeln

- Es gilt der [Verhaltenskodex](CODE_OF_CONDUCT.md).
- Mit einem Beitrag stellst du ihn unter die Lizenz des jeweiligen Bereichs: Code unter AGPL-3.0-or-later, Rezepte, Zutatenkatalog und Dokumentation unter CC BY-SA 4.0 (siehe `REUSE.toml`).
- Übernimm keine Rezepttexte oder Bilder, an denen du keine Rechte hast.

## Ablauf

1. Issue anlegen oder ein bestehendes aufgreifen.
2. Branch von `main`, kleine, fokussierte Änderungen.
3. Commits nach [Conventional Commits](https://www.conventionalcommits.org/de/) (`feat:`, `fix:`, `docs:`, `chore:` …). Der Titel des Pull Requests folgt derselben Konvention, weil per Squash gemergt wird.
4. Vor dem Pull Request lokal prüfen:
   ```sh
   pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
   ```
5. Alle CI-Checks müssen grün sein.

## Sicherheitsregeln im Code

- Kein `v-html`, kein `innerHTML`; Nutzerinhalte werden immer als Text gerendert.
- Keine Fremdskripte, Fremd-Fonts oder Tracker; die CSP (`build/csp.ts`) wird nicht gelockert.
- `src/core` importiert weder Vue noch `ui`, `providers` oder `app`.
- Code, der beim Start geladen wird, importiert aus `@/core/base` (ohne Rezept-Parser und Suche); `@/core` nur in den Rezept-Ansichten. In `src/core` gilt dasselbe für das Rezeptformat: `@tafelritter/rezeptformat/basis` in allem, was `base.ts` exportiert, `@tafelritter/rezeptformat` nur im Rest. So bleibt der Start-Chunk unter dem Lighthouse-Budget.
- Neue Abhängigkeiten nur mit AGPL-kompatibler Lizenz (`pnpm licenses:check`) und mit Begründung im Pull Request.
- Änderungen am Sicherheitsmodell aktualisieren `docs/threat-model.md`.

## Rezepte und Zutaten

Öffentliche Rezepte, Zutatenkatalog und Nährwerte haben ein eigenes Repository: **[Tafelritter/katalog](https://github.com/Tafelritter/katalog)** (CC BY-SA 4.0). Dort stehen Beitragsregeln und Schreibweise. Das Rezeptformat selbst (Cooklang-Parser, Kategorien, Katalogprüfung) liegt in **[Tafelritter/rezeptformat](https://github.com/Tafelritter/rezeptformat)**.

Die App holt beim Build das in `katalog.json` eingetragene Katalog-Release (Version und SHA-256) nach `public/catalog/`. Neues Release eintragen: `pnpm katalog:update [vX.Y.Z]` – Renovate schlägt das auch selbst vor. Einen unveröffentlichten Katalog testen: im Katalog-Repo das Archiv bauen und `KATALOG_DATEI=<pfad.tar.gz> pnpm dev`.
