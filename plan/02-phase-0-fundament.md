# Phase 0 – Fundament

**Ziel:** Das größte technische Risiko, der Sync über Google Drive, ist geklärt. Das Repo steht mit Lizenzen, CI/CD und Security-Baseline, und eine leere App lässt sich installieren und wird automatisch deployt.

## Aufgaben

### 0.1 Google-Cloud-Projekt
- [ ] Projekt anlegen, Drive API aktivieren
- [ ] OAuth-Zustimmungsbildschirm: extern, Testmodus, Familie als Testnutzer, Scope nur `drive.file`
- [ ] OAuth-Client (Typ Web) mit den Origins `http://localhost:5173` und `https://tafelrunde.niedermaier.bayern`; Weiterleitungs-URI jeweils `…/auth/callback.html`
- [ ] `niedermaier.bayern` als autorisierte Domain auf dem Zustimmungsbildschirm eintragen; falls Google es verlangt, über die Google Search Console bestätigen (kostenlos, DNS-TXT-Eintrag)
- [ ] API-Key, beschränkt auf die Drive API und die HTTP-Referrer der App
- [x] Anleitung in `docs/setup/google-cloud.md`, auch für Forks

### 0.1b Domain und GitHub Pages
- [ ] Zwei-Faktor-Anmeldung beim Domain-Anbieter prüfen bzw. aktivieren
- [ ] Domain in den GitHub-Kontoeinstellungen verifizieren (TXT-Eintrag `_github-pages-challenge-…`)
- [ ] DNS: CNAME `tafelrunde` → `<konto>.github.io`
- [ ] Falls CAA-Einträge existieren, `letsencrypt.org` erlauben
- [ ] Pages-Einstellungen: eigene Domain eintragen, „Enforce HTTPS“ aktivieren
- [x] Anleitung in `docs/setup/hosting.md`

### 0.2 Machbarkeitstest Drive-Sync (Timebox: 3 Tage)
Wegwerf-Code in `spikes/drive-sync/`, er wird nicht übernommen. Getestet wird auf Android (installierte PWA) und am Desktop (Chrome, Firefox).

- [ ] **Login per Weiterleitung:** Kommt die installierte Android-PWA nach der Anmeldung zuverlässig zurück? Klappt die stille Erneuerung mit `prompt=none` beim App-Start? Wie verhält es sich bei abgelaufener Google-Sitzung? Wie oft ist im Alltag ein Tipp nötig?
- [ ] **Token-Speicherung:** nur Arbeitsspeicher oder IndexedDB bis zum Ablauf; Auswirkung auf die Zahl der Weiterleitungen messen
- [ ] **Freigabe:** Mit `drive.file` eine Datei anlegen und „Jeder mit Link: Lesen“ setzen
- [ ] **Lesen ohne Login:** Die Datei aus einem anderen Browser oder Konto per API-Key lesen, Metadaten und Inhalt, inklusive CORS
- [ ] **Abfrage:** Eine Stunde lang alle 3 s die Metadaten abfragen; Latenz, Fehler und Kontingentverhalten messen
- [ ] **Roundtrip:** Yjs und AES-GCM zwischen zwei Geräten, gleichzeitige Änderungen online und offline
- [ ] Ergebnis in `docs/adr/0001-sync-google-drive.md`: Go oder No-Go, Token-Speicherung, gemessene Werte

**Abbruchkriterium:** Funktioniert das Lesen per API-Key nicht oder reichen die Kontingente nicht, wird vor Phase 1 Dropbox als Anbieter geprüft.

### 0.3 Repo-Grundgerüst
- [x] Vite, Vue 3, TypeScript im `strict`-Modus, pnpm; Node-LTS gepinnt (`.nvmrc`, `packageManager`)
- [x] Ordnerstruktur laut [Architektur](01-architektur.md#code-struktur); ESLint setzt die Regel durch, dass `core` weder `ui` noch `providers` importiert
- [x] Vue Router im Hash-Modus, `vite-plugin-pwa` (Manifest, Service Worker, Offline-Shell, Hinweis bei neuer Version)
- [x] Eigene Seite `auth/callback.html` für die OAuth-Rückkehr, außerhalb des Routers (siehe [Login per Weiterleitung](01-architektur.md#login-per-weiterleitung))
- [x] Barrierearme UI-Grundbausteine bewerten, z. B. Reka UI (MIT)

### 0.4 Lizenzen und Projektdateien
- [x] `LICENSE` (AGPL-3.0) und `catalog/LICENSE` (CC BY-SA 4.0)
- [x] REUSE-konform über `REUSE.toml` oder SPDX-Header
- [x] `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (Meldeweg über GitHub Private Vulnerability Reporting)
- [x] Vorlagen für Issues und PRs, `CODEOWNERS`

### 0.5 CI bei jedem Pull Request
- [x] Installation mit `--frozen-lockfile`
- [x] ESLint (mit `vue/no-v-html` und den Import-Grenzen) und Prettier-Check
- [x] Typecheck mit `vue-tsc`
- [x] Unit-Tests mit Abdeckung (Vitest)
- [x] Build
- [x] E2E-Tests mit Playwright (Chromium und Firefox), inklusive Barrierefreiheit per axe
- [x] Lighthouse CI (PWA, Performance-Budget)
- [x] Lizenzen: `reuse lint` und Abgleich der Abhängigkeiten mit einer Allowlist AGPL-kompatibler Lizenzen
- [x] Commit-Konvention (Conventional Commits)

### 0.6 Security-Workflows
- [x] CodeQL für JavaScript und TypeScript
- [x] Dependency Review: blockiert bekannte Schwachstellen und inkompatible Lizenzen
- [x] OSV-Scanner und gitleaks
- [x] OpenSSF Scorecard (wöchentlich)
- [x] Renovate mit gruppierten Updates
- [ ] In GitHub: Secret Scanning mit Push Protection, Private Vulnerability Reporting, Branch-Schutz mit Pflicht-Checks
- [x] Alle Actions per Commit-SHA gepinnt, `permissions:` je Workflow minimal

### 0.7 Auslieferung
- [x] release-please erzeugt Versionen und Changelog aus den Commits
- [x] Deployment auf GitHub Pages bei jedem Release
- [x] Build-Provenance-Attestierung (`actions/attest-build-provenance`)

### 0.8 Security-Baseline der App
- [x] Content-Security-Policy als `<meta http-equiv>` ganz am Anfang des `<head>`: `default-src 'self'`, `connect-src` nur für Google-APIs, kein `unsafe-inline` oder `unsafe-eval`
- [x] Frame-Erkennung: In einem fremden Frame rendert die App nicht (Ersatz für `frame-ancestors`)
- [x] `<meta name="referrer" content="no-referrer">`
- [x] Keine Fremdskripte, keine Fremd-Fonts, keine Tracker
- [x] Trusted Types in Chromium prüfen
- [x] `docs/threat-model.md` in Version 0, abgeleitet aus dem [Sicherheitskonzept](01-architektur.md#sicherheitskonzept)

### 0.9 Design-Tokens
Umgesetzt als CSS-Custom-Properties mit den Modi Hell, Dunkel und System. Ziel ist WCAG 2.2 AA. Fett gesetzte Werte sind neu oder geändert gegenüber `idea.md`.

| Token | Light | Dark | Hinweis |
|---|---|---|---|
| `--bg` | #FAF8F5 | #141715 | |
| `--surface` | #FFFFFF | #1F2421 | |
| `--text` | #1E2421 | #F2EFE9 | auch für Mengenangaben |
| `--text-muted` | #5C6660 | #9BA39E | |
| `--primary` | #2D6A4F | #52B788 | |
| `--on-primary` | #FFFFFF | **#141715** | Weiß auf #52B788 erreicht nur 2,5:1 |
| `--accent` | #D96B43 | #E88D67 | Icons, Flächen, große Schrift |
| `--accent-text` | **#B4532F** | #E88D67 | Text in Akzentfarbe (4,7:1 / 6,3:1) |
| `--on-accent` | **#1E2421** | **#141715** | Text auf Akzent-Badges |
| `--border` | #E6E2DC | #2E3531 | nur dekorative Trennlinien |
| `--border-strong` | **#868E89** | **#68726C** | Eingabefelder und Bedienelemente (mindestens 3:1) |
| `--checked` | **#8A908C** | **#6E7771** | statt #A3A8A5 / #4A524D, etwa 3:1 |
| `--error` | **#B3261E** | **#F2A097** | |
| `--warning` | **#8A5A00** | **#E9C46A** | |
| `--success` | wie `--primary` | wie `--primary` | |
| `--focus` | #2D6A4F | #52B788 | 2 px Ring mit 2 px Abstand |
| Familien-Badges | #E9C46A, #F4A261, #8AB17D | dieselben | immer mit dunklem Text |

- [x] Tokens umsetzen; ein Unit-Test prüft die Kontraste aller relevanten Token-Paare
- [x] Schrift festlegen: Systemschrift oder selbst gehostet, keine Google Fonts
- [x] Basis-Komponenten: Button, Eingabefeld, Checkbox, Listeneintrag, Karte, Badge, Toast, Dialog, Sync-Status

## Akzeptanzkriterien
- ADR 0001 liegt vor, mit Go oder einer Entscheidung für eine Alternative
- Die leere App ist unter `https://tafelrunde.niedermaier.bayern` erreichbar, lässt sich auf Android installieren, startet offline und wird bei jedem Release automatisch deployt
- Alle CI- und Security-Checks laufen und sind Pflicht für `main`
- `reuse lint` ist grün

## Nicht Teil dieser Phase
Fachfunktionen. Der Code aus dem Machbarkeitstest wird nicht übernommen.
