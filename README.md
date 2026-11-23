# Tafelrunde

Rezepte, Wochenplanung und geteilte Einkaufslisten für Familie und Freunde – als installierbare Web-App für Android und Desktop.

- **Keine Server, keine Kosten.** Die App wird als statische Seite über GitHub Pages ausgeliefert.
- **Deine Daten bleiben bei dir.** Sie liegen auf deinen Geräten und, Ende-zu-Ende verschlüsselt, in deinem eigenen Cloud-Speicher (zunächst Google Drive). Das Projekt sieht keine Nutzerdaten.
- **Offen.** Code unter [AGPL-3.0-or-later](LICENSE), Rezepte und Zutatenkatalog unter [CC BY-SA 4.0](https://github.com/Tafelritter/katalog) im eigenen Repository.

> **Stand:** Phase 4 (Rezept-Import und Nährwerte) – siehe [Planung](plan/README.md).

## Entwicklung

Voraussetzungen: Node.js 24 (siehe `.nvmrc`) und pnpm über Corepack (`corepack enable`).

```sh
pnpm install
cp .env.example .env.local   # Google-Konfiguration eintragen, siehe docs/setup/google-cloud.md
pnpm dev                     # holt den Katalog (einmalig, aus GitHub) und startet http://localhost:5173
```

| Befehl                             | Zweck                                                     |
| ---------------------------------- | --------------------------------------------------------- |
| `pnpm lint`                        | ESLint, inklusive Architektur-Grenzen und XSS-Regeln      |
| `pnpm format:check`                | Prettier                                                  |
| `pnpm typecheck`                   | `vue-tsc`                                                 |
| `pnpm test` / `pnpm test:coverage` | Unit-Tests (Vitest)                                       |
| `pnpm build`                       | Produktions-Build nach `dist/`                            |
| `pnpm test:e2e`                    | Playwright (Chromium, Firefox, Android-Emulation) mit axe |
| `pnpm licenses:check`              | Lizenzen der Abhängigkeiten gegen die Allowlist           |
| `pnpm katalog:update [vX.Y.Z]`     | neues Katalog-Release in `katalog.json` eintragen         |

## Aufbau

```
src/core/       Domäne ohne Framework (Krypto, Sync, Modell, Plan, Import, Nährwerte)
src/providers/  Speicheranbieter (gdrive/)
src/ui/         Design-Tokens und Basis-Komponenten
src/app/        Router, Start, PWA
auth/           OAuth-Rückkehrseite außerhalb des Routers
tools/          Katalog holen (katalog.mjs), Lizenzprüfung, Icons
docs/           ADRs, Bedrohungsmodell, Setup-Anleitungen
plan/           Planung
```

Zwei weitere Repositories in der Organisation [Tafelritter](https://github.com/Tafelritter) gehören dazu ([ADR 0005](docs/adr/0005-aufteilung-in-repositories.md)):

| Repository                                                  | Inhalt                                                          | Einbindung in die App                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [rezeptformat](https://github.com/Tafelritter/rezeptformat) | Cooklang-Parser, Mengen, Referenzen, Kategorien, Katalogprüfung | Paket `@tafelritter/rezeptformat` per Git-Tag                            |
| [katalog](https://github.com/Tafelritter/katalog)           | öffentliche Rezepte, Zutatenkatalog, Nährwerte (CC BY-SA 4.0)   | Release-Archiv, Version und SHA-256 in `katalog.json`, beim Build geholt |

Details: [Architektur](plan/01-architektur.md), [Bedrohungsmodell](docs/threat-model.md).

## Mitmachen

Siehe [CONTRIBUTING.md](CONTRIBUTING.md). Sicherheitslücken bitte nicht öffentlich melden, sondern wie in [SECURITY.md](SECURITY.md) beschrieben.
