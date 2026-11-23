# ADR 0001 – Sync über Google Drive

- **Status:** offen (Machbarkeitstest läuft, Timebox 3 Tage)
- **Datum:** 2026-11-20

## Kontext

Jedes Gerät schreibt eine verschlüsselte Datei in das eigene Drive (Scope `drive.file`) und gibt sie per „Jeder mit Link: Lesen“ frei. Die anderen Geräte lesen per API-Key ohne Anmeldung. Details: [Architektur](../../plan/01-architektur.md#sync-protokoll).

Der Machbarkeitstest liegt in `spikes/drive-sync/` (Wegwerf-Code, siehe dortiges README).

## Zu klärende Fragen und Messwerte

| Frage                                                                                    | Ergebnis |
| ---------------------------------------------------------------------------------------- | -------- |
| Kommt die installierte Android-PWA nach dem Login per Weiterleitung zuverlässig zurück?  | _offen_  |
| Klappt die stille Erneuerung mit `prompt=none` beim App-Start?                           | _offen_  |
| Verhalten bei abgelaufener Google-Sitzung                                                | _offen_  |
| Tipps pro Tag im Alltag                                                                  | _offen_  |
| Token-Speicherung: Arbeitsspeicher vs. IndexedDB bis Ablauf; Zahl der Weiterleitungen    | _offen_  |
| `drive.file`: Datei anlegen und `anyone`/`reader` setzen                                 | _offen_  |
| Lesen ohne Login per API-Key aus anderem Browser/Konto (Metadaten und `alt=media`), CORS | _offen_  |
| Greift die Referrer-Beschränkung des API-Keys trotz `no-referrer`?                       | _offen_  |
| 1 h Abfrage alle 3 s: Latenz (p50/p95), Fehler, Kontingent                               | _offen_  |
| Yjs + AES-GCM zwischen zwei Geräten, gleichzeitig online und offline                     | _offen_  |

## Stand der Umsetzung (vorläufig)

Der Provider (`src/providers/gdrive/`) ist umgesetzt und gegen eine nachgebildete API getestet:

- Token nur im Arbeitsspeicher; stille Erneuerung beim Start, wenn Änderungen ausstehen, höchstens einmal je Sitzung.
- Anfragen mit API-Key senden `Referrer-Policy: strict-origin` (nur die Herkunft), damit eine Referrer-Beschränkung des Keys greifen kann; alle anderen Anfragen `no-referrer`.
- Dateien im Ordner `Tafelrunde/`, Name zufällig, Freigabe `anyone`/`reader` mit `allowFileDiscovery: false`.
- Versionserkennung über `md5Checksum` (Ersatz: `modifiedTime`).

Die Fragen oben sind damit nicht beantwortet; das klärt nur der Test mit echtem Konto.

## Entscheidung

_Go / No-Go – nach Abschluss des Tests eintragen._

**Abbruchkriterium:** Funktioniert das Lesen per API-Key nicht oder reichen die Kontingente nicht, wird vor Phase 1 Dropbox geprüft.

## Folgen

_nach Entscheidung eintragen_
