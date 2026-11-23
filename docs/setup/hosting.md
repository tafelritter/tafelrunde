# Hosting auf GitHub Pages mit eigener Subdomain

Die App wird unter `https://tafelrunde.niedermaier.bayern` ausgeliefert. Die eigene Subdomain ist eine **exklusive Herkunft**: Unter `<konto>.github.io` teilten sich alle Pages-Seiten des Kontos den lokalen Speicher, in dem die Bereichsschlüssel liegen.

## 1. Domain absichern

- [ ] Zwei-Faktor-Anmeldung beim Domain-Anbieter aktivieren.
- [ ] Domain bei GitHub verifizieren – für die Organisation: **GitHub → Organisation Tafelritter → Settings → Pages → Add a domain** → `niedermaier.bayern`. GitHub nennt einen TXT-Eintrag `_github-pages-challenge-tafelritter.niedermaier.bayern`; diesen beim Domain-Anbieter anlegen und bestätigen. Danach kann niemand sonst die Domain oder ihre Subdomains für Pages beanspruchen.

## 2. DNS

| Typ   | Name         | Wert                     |
| ----- | ------------ | ------------------------ |
| CNAME | `tafelrunde` | `tafelritter.github.io.` |

Existieren CAA-Einträge für `niedermaier.bayern`, muss einer `letsencrypt.org` erlauben:

```
niedermaier.bayern. CAA 0 issue "letsencrypt.org"
```

Prüfen:

```sh
nslookup -type=CNAME tafelrunde.niedermaier.bayern
nslookup -type=CAA niedermaier.bayern
```

## 3. Repository

- [ ] **Settings → Pages → Source: GitHub Actions.** Das Deployment übernimmt `.github/workflows/release.yml`.
- [ ] **Custom domain:** `tafelrunde.niedermaier.bayern` (zusätzlich liegt `public/CNAME` im Build).
- [ ] **Enforce HTTPS** aktivieren, sobald das Zertifikat ausgestellt ist (kann bis zu einer Stunde dauern).
- [ ] **Settings → Actions → General → Workflow permissions:** „Read repository contents“ und **„Allow GitHub Actions to create and approve pull requests“** (für release-please).
- [ ] **Settings → Environments → github-pages:** Deployment nur von `main`.

## 4. Repository-Schutz (Security-Baseline)

- [ ] **Settings → Code security:** Dependency graph, Dependabot alerts, Secret scanning und **Push protection**, **Private vulnerability reporting** aktivieren.
- [ ] **Settings → Rules → Rulesets** für `main`:
  - Pull Request erforderlich, Squash-Merge
  - Pflicht-Checks: `Lint, Typen, Tests, Build`, `E2E und Barrierefreiheit`, `Lighthouse`, `REUSE`, `Conventional Commits (PR-Titel)`, `CodeQL`, `Dependency Review`, `OSV-Scanner`, `gitleaks`
  - Kein Force-Push, kein Löschen
- [ ] Renovate-App für das Repository installieren: <https://github.com/apps/renovate>.

## 5. Grenzen von GitHub Pages

Eigene HTTP-Header sind nicht möglich. Deshalb:

- CSP als `<meta http-equiv>` ganz am Anfang des `<head>` (`build/csp.ts`)
- Clickjacking-Schutz per Frame-Erkennung statt `frame-ancestors` (`src/app/frame-guard.ts`)
- `<meta name="referrer" content="no-referrer">`
