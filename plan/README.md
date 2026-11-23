# Tafelrunde – Planung

Eigene App für Rezepte, Wochenplanung und geteilte Einkaufslisten. Ergebnis der Evaluation von [`idea.md`](../idea.md), Stand 2026-11-20.

## Leitplanken

- **0 € Betriebskosten, keine eigene Infrastruktur.** Das Projekt betreibt keinen Server.
- **Nutzer- und Personendaten liegen ausschließlich beim Nutzer:** auf seinen Geräten und in seinem eigenen Cloud-Speicher, Ende-zu-Ende verschlüsselt. Der Betreiber hält keine Nutzerdaten.
- **Security-First** und **Open Source**: Code unter AGPL-3.0, Inhalte unter CC BY-SA 4.0.
- **Zielgeräte:** Android und Desktop.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Plattform | PWA (installierbare Web-App) |
| Frontend | Vue 3 + TypeScript + Vite |
| Rezeptformat | Cooklang, Editor mit Einfügehilfen |
| Öffentliche Rezepte, Zutatenkatalog | öffentliches GitHub-Repo, Beiträge per Pull Request |
| Nutzerdaten & Sync | Jedes Gerät schreibt eine verschlüsselte Datei in den eigenen Speicher, die anderen lesen per Lese-Link mit. Zusammenführung per CRDT (Yjs). |
| Erster Speicheranbieter | Google Drive (testweise), Sync-Schicht austauschbar |
| Echtzeit | Abfrage alle 3–5 s, solange die App offen ist |
| Import | Bookmarklet (Desktop), Text teilen oder einfügen (Android) |
| Nährwerte | spätere Phase, Bundeslebensmittelschlüssel (BLS 4.0) |
| Alexa | verworfen |
| Lizenzen | Code AGPL-3.0, Rezepte und Katalog CC BY-SA 4.0 |
| Repo, CI/CD | GitHub, GitHub Actions |
| Hosting | GitHub Pages unter eigener Subdomain `tafelrunde.niedermaier.bayern` (exklusive Herkunft, HTTPS automatisch über GitHub) |
| Google-Login | OAuth per Weiterleitung, ohne Skript von Google; stille Erneuerung beim App-Start |
| Reihenfolge | Einkaufsliste zuerst |

## Roadmap

| Phase | Inhalt | Ergebnis |
|---|---|---|
| [0 – Fundament](02-phase-0-fundament.md) | Machbarkeitstest Drive-Sync, Repo, Lizenzen, CI/CD, Security-Baseline, Design-Tokens | Go/No-Go für Drive, leere deploybare App |
| [1 – Einkaufsliste](03-phase-1-einkaufsliste.md) | Haushalt, Einladen, verschlüsselter Sync, Liste mit Kategorien, Listen teilen | erste Version im Familienalltag |
| [2 – Rezepte](04-phase-2-rezepte.md) | Cooklang, Editor, Referenzen, Tags, Filter, Notizen, Bewertungen, Katalog, Rezepte teilen | Rezeptsammlung |
| [3 – Planung](05-phase-3-planung.md) | Wochenplan, Einkaufsliste aus Rezepten und Plan | Kreislauf Planen → Einkaufen → Kochen |
| [4 – Import & Nährwerte](06-phase-4-import-naehrwerte.md) | Bookmarklet, Text-Import, Nährwerte | Komfortfunktionen |
| [Backlog](07-backlog.md) | zurückgestellte und verworfene Ideen | – |

Jede Phase endet mit einer nutzbaren Version, grüner CI und aktualisiertem Bedrohungsmodell.

## Dokumente

- [00 – Evaluation](00-evaluation.md): alle Punkte aus `idea.md` mit Optionen und Ergebnis
- [01 – Architektur](01-architektur.md): Datenmodell, Sync, Verschlüsselung, Sicherheitskonzept, Risiken
