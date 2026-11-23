# Machbarkeitstest Drive-Sync (Phase 0.2)

**Wegwerf-Code.** Wird nicht in die App übernommen. Ergebnisse gehören in [ADR 0001](../../docs/adr/0001-sync-google-drive.md).

## Start

1. Google-Cloud-Projekt nach [docs/setup/google-cloud.md](../../docs/setup/google-cloud.md) einrichten, Werte in `.env.local` im Repo-Wurzelverzeichnis.
2. `pnpm spike` → <http://localhost:5173>

## Android testen (ohne Deployment)

Google erlaubt OAuth-Weiterleitungen nur auf HTTPS oder `localhost`. Mit Portweiterleitung läuft das Handy gegen den Entwicklungsrechner:

1. Auf dem Handy USB-Debugging aktivieren, per USB verbinden.
2. Am Desktop in Chrome `chrome://inspect/#devices` → **Port forwarding** → `5173` → `localhost:5173`.
3. Auf dem Handy in Chrome `http://localhost:5173` öffnen und **„Zum Startbildschirm hinzufügen“** (installierte PWA).

## Ablauf

| Schritt           | Knopf                                                                                | Was zu notieren ist                                                    |
| ----------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Login             | „Anmelden“ / „Still erneuern“                                                        | Rückkehr in die installierte PWA? Fehlercode bei abgelaufener Sitzung? |
| Token-Speicherung | Häkchen „Token in IndexedDB“                                                         | Weiterleitungen pro Tag mit/ohne                                       |
| Freigabe          | „Datei anlegen + freigeben“                                                          | Datei-ID notieren                                                      |
| Lesen ohne Login  | Auf Gerät B (anderer Browser/kein Login) Datei-ID eintragen, „Lesen“                 | CORS ok? Referrer-Beschränkung?                                        |
| Abfrage           | „1 h abfragen (3 s)“                                                                 | p50/p95, Fehler, 403/429                                               |
| Roundtrip         | Auf beiden Geräten Einträge hinzufügen, schreiben, gegenseitig lesen; einmal offline | Beide Stände zusammengeführt?                                          |

Das Protokoll unten auf der Seite lässt sich kopieren.
