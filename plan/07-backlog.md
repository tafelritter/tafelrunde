# Backlog

## Verworfen

| Idee | Grund |
|---|---|
| Alexa-Integration | Die Listen-API ist seit 1.7.2024 abgeschaltet. Ein eigener Skill liefe bei Amazon und bräuchte den Haushaltsschlüssel; das widerspricht „Daten ausschließlich beim Nutzer“. |
| Öffentliche Rezept-Plattform in der App | Bräuchte Moderation, Impressum, DSA-Pflichten und einen Server. Ersetzt durch den GitHub-Katalog. |
| URL-Import über einen Proxy | Wäre eigene Infrastruktur oder ein fremder Dienst. |
| Zentrale Sync-Dienste (Jazz, Firebase, Supabase) | Die Daten lägen nicht beim Nutzer. |
| Native Apps | Die Verteilung auf iOS kostet 99 $ pro Jahr. |

## Zurückgestellt

| Idee | Nutzen | Voraussetzung |
|---|---|---|
| Dropbox als Anbieter | dauerhafte Anmeldung ohne Tipp (PKCE mit Refresh-Token) | Bedarf; Machbarkeitstest für Lese-Links und CORS |
| OneDrive als Anbieter | weitere Nutzergruppe | Anmeldung hält nur 24 Stunden |
| WebDAV/Nextcloud als Anbieter | für Selbsthoster | CORS-Konfiguration beim Nutzer |
| Gemischte Anbieter im Haushalt | jede Person nutzt ihren eigenen Speicher | Lese-Links aller Anbieter im Browser abrufbar |
| Direktverbindung per WebRTC | sofortige Updates, solange Geräte gleichzeitig offen sind | Signalisierung gegen die Datenregel prüfen |
| Automatischer Schlüsselwechsel (X25519) | Entfernen ohne erneutes Scannen | Phase 1 stabil |
| iOS-Unterstützung | weitere Geräte | Machbarkeitstest für den Google-Login in der installierten iOS-PWA |
| Android-App (TWA, F-Droid) | Präsenz im Store | nur bei Bedarf |
| Familienfarben und Wunschliste | Wünsche einzelner Mitglieder markieren (Pastell-Badges aus dem Farbkonzept) | Phase 3 |
| Allergene und Unverträglichkeiten | Filter für Gluten, Laktose, Nüsse … | Zutatenkatalog erweitern |
| Vorratsverwaltung | Bestände beim Planen berücksichtigen | Phase 3 |
| Mehrsprachigkeit | Englisch | Texte zentral halten |
| Druck- und PDF-Ansicht | Rezepte ausdrucken | – |
