# Welche Daten liegen wo?

Stand: Phase 4 (Rezept-Import). Dieser Hinweis beschreibt, was Tafelrunde speichert und wer es sehen kann. Er ersetzt keine Datenschutzerklärung; solange die App nur privat in der Familie genutzt wird, ist keine nötig (siehe [Architektur, offene Punkte](../plan/01-architektur.md#offene-punkte-klärung-in-phase-0)).

## Auf deinem Gerät

| Was                                               | Wo                                       | Lesbar für               |
| ------------------------------------------------- | ---------------------------------------- | ------------------------ |
| Dein Name, Gerätename, Geräte-ID                  | IndexedDB (`tafelrunde`)                 | dieses Gerät             |
| Bereichsschlüssel (256 Bit je Bereich)            | IndexedDB, als `CryptoKey`               | dieses Gerät             |
| Listen, Einträge, Läden, Mitglieder (vollständig) | IndexedDB (y-indexeddb), unverschlüsselt | dieses Gerät             |
| Google-Zugriffstoken                              | nur Arbeitsspeicher, höchstens 1 Stunde  | dieses Gerät             |
| Merker „mit Google verbunden“, Hinweis-Status     | localStorage                             | dieses Gerät             |
| App-Code und Artikel-Katalog                      | Service-Worker-Cache                     | öffentlich (Open Source) |

Wer Zugriff auf das entsperrte Gerät und den Browser hat, kann die Daten lesen. Schütze das Gerät mit einer Bildschirmsperre.

## In deinem Google Drive

- Ordner `Tafelrunde/` mit zwei Dateien je Bereich und Gerät (Listen und Rezepte) und einer Datei je Foto, das du hinzugefügt hast; zufällige Dateinamen ohne Personenbezug.
- Inhalt: der vollständige Stand des Bereichs, **Ende-zu-Ende verschlüsselt** (AES-256-GCM). Ohne Bereichsschlüssel nicht lesbar – auch nicht für Google.
- Jede Datei ist für „Jeder mit Link: Lesen“ freigegeben, damit die anderen Geräte sie ohne Anmeldung lesen können. Der Link allein nützt nichts.
- Die App hat nur Zugriff auf Dateien, die sie selbst angelegt hat (Scope `drive.file`), nicht auf den Rest deines Drives.

**Für Google sichtbar** bleiben Metadaten: Dateigröße, Änderungszeitpunkte, wie oft und von welcher IP-Adresse eine Datei abgerufen wird, und die Herkunft der App (`tafelrunde.niedermaier.bayern`) bei Abrufen mit API-Key.

## In Einladungen und Codes

| Code                      | Enthält                                            | Geheim?                                |
| ------------------------- | -------------------------------------------------- | -------------------------------------- |
| Einladung, Schlüssel-Code | Bereichs-ID, Bereichsname, **Schlüssel**, Datei-ID | ja – wer ihn hat, kann alles lesen     |
| Wiederherstellungscode    | Bereichs-ID, Name, **Schlüssel**, alle Datei-IDs   | ja – ausdrucken und sicher aufbewahren |
| Antwort-Code              | Bereichs-ID, Geräte-ID, Name, Gerätename, Datei-ID | nein – enthält keinen Schlüssel        |

Codes stehen im URL-Fragment (`#/…`) und werden nie an einen Server gesendet. Als Link im Messenger bleibt eine Einladung dort lesbar; bevorzugt den QR-Code.

## Beim Import von Rezepten

- **Bookmarklet:** Es läuft auf der Rezeptseite, liest dort die Rezeptdaten (oder den markierten Text) und übergibt sie nur an das Tafelrunde-Fenster, das es selbst geöffnet hat. Es sendet nichts an andere Stellen und lädt nichts nach. Die Rezeptseite erfährt, dass Tafelrunde geöffnet wurde.
- **Teilen unter Android:** Der geteilte Text kommt als Teil der Startadresse in die App und wird sofort daraus entfernt. Bei installierter App beantwortet der Service Worker den Aufruf, der Text erreicht dann keinen Server. Ohne Service Worker (z. B. beim allerersten Aufruf) landet er in der Anfrage an GitHub Pages.
- Importierte Rezepte werden wie eigene behandelt: Sie liegen im gewählten Bereich, verschlüsselt im eigenen Speicher. Die Quelle (Adresse) und das Importdatum stehen im Rezept.

## Beim Betreiber

Nichts. Das Projekt betreibt keinen Server. GitHub Pages liefert nur die App aus und verarbeitet dabei wie jeder Webserver IP-Adressen.

## Mitglieder eines Bereichs

Alle Geräte eines Bereichs sehen dessen gesamten Inhalt und die Namen aller Mitglieder und Geräte. Ein entferntes Gerät behält, was es bis dahin gesehen hat.
