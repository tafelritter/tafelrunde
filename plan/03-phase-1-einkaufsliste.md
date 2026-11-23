# Phase 1 – Geteilte Einkaufsliste

**Ziel:** Die Familie nutzt im Alltag eine gemeinsame Einkaufsliste mit Kategorien, die verschlüsselt synchronisiert wird. Damit ist die Sync-Architektur im echten Einsatz erprobt.

**Voraussetzung:** Phase 0 abgeschlossen, mit Go für Google Drive.

## Aufgaben

### 1.1 Domänenkern (`src/core`)
- [x] Typen und Yjs-Schema für Bereich, Gerät, Register, Liste und Eintrag
- [x] Interface `StorageProvider`: eigene Datei anlegen und aktualisieren, Lese-Freigabe setzen, fremde Datei lesen (Metadaten und Inhalt), Anmeldestatus
- [x] Fake-Provider im Arbeitsspeicher für Tests

### 1.2 Krypto
- [x] Schlüsselerzeugung, AES-256-GCM, AAD, `seq`, base64url
- [x] Tests mit festen Testvektoren sowie für Manipulation und Rollback

### 1.3 Google-Drive-Provider

> Umgesetzt und gegen eine nachgebildete Drive-API getestet. Der Test mit echtem Google-Konto steht mit ADR 0001 aus; bis dahin liegt das Token nur im Arbeitsspeicher, und Anfragen mit API-Key senden `strict-origin` als Referrer.

- [x] Login per Weiterleitung laut [Architektur](01-architektur.md#login-per-weiterleitung), Scope `drive.file`: `state`-Prüfung, Token sofort aus der URL entfernen, stille Erneuerung mit `prompt=none`, sonst „Anmeldung nötig“; Token-Speicherung wie in ADR 0001
- [x] Datei im Ordner `Tafelrunde/` anlegen, Freigabe setzen, aktualisieren
- [x] Lesen per API-Key; Fehlerbehandlung für fehlende Dateien, erschöpfte Kontingente und offline, jeweils mit Backoff

### 1.4 Sync-Engine
- [x] Lokale Persistenz mit y-indexeddb
- [x] Schreiben: Entprellung, ein Vorgang gleichzeitig, `seq`, Warteschlange solange kein Token da ist
- [x] Lesen: Intervalle je Ansicht, Page Visibility, sofortige Abfrage beim Zurückkehren (`PollLoop`; 3 s im geöffneten Bereich, sonst 15 s)
- [x] Zusammenführen, Rollback-Schutz, nicht entschlüsselbare Dateien ignorieren
- [x] Komponente für den Sync-Status

### 1.5 Einrichtung
- [x] Erster Start: eigener Name und Gerätename
- [x] „Mit Google verbinden“, nur fürs Schreiben nötig
- [x] Der persönliche Bereich wird automatisch angelegt
- [x] Haushalt anlegen

### 1.6 Einladen und Beitreten
- [x] Einladung als QR-Code und Link, Schlüssel im URL-Fragment
- [x] QR-Code mit der Kamera scannen (Android: BarcodeDetector); am Desktop den Link einfügen
- [x] Antwort-Code zurück an das einladende Gerät
- [x] Liste der Mitglieder und Geräte, Geräte umbenennen

### 1.7 Entfernen und Schlüsselwechsel
- [x] Gerät entfernen, neuen Schlüssel erzeugen, verbleibende Geräte per QR aktualisieren

### 1.8 Wiederherstellung
- [x] Wiederherstellungscode je Bereich anzeigen und drucken; beim Einrichten darauf hinweisen
- [x] Bereich auf einem neuen Gerät aus dem Code wiederherstellen

### 1.9 Artikel-Grundkatalog
- [x] `catalog/ingredients/` mit etwa 300 häufigen Artikeln samt Kategorie und Synonymen, auch Nicht-Lebensmittel wie Drogerieartikel
- [x] Standard-Kategorien: Obst & Gemüse · Brot & Backwaren · Milch, Käse & Eier · Fleisch, Wurst & Fisch · Tiefkühl · Nudeln, Reis & Konserven · Backen · Gewürze, Öle & Saucen · Frühstück & Aufstriche · Süßes & Snacks · Getränke · Drogerie & Haushalt · Sonstiges
- [x] Build-Skript erzeugt die Katalogdateien für die App (siehe [Katalog-Pipeline](01-architektur.md#katalog-pipeline))

### 1.10 Einkaufsliste
- [x] Mehrere Listen pro Bereich
- [x] Eintrag hinzufügen mit Vorschlägen aus Katalog und bisherigen Einträgen; Menge, Einheit und Notiz frei
- [x] Gruppierung nach Kategorie; wird eine Kategorie geändert, merkt sich der Haushalt die Zuordnung
- [x] Läden mit eigener Reihenfolge der Kategorien
- [x] Abhaken: gedimmt, durchgestrichen, ans Ende der Gruppe; Rückgängig; „Erledigte entfernen“
- [x] Doppelte Einträge erkennen und Zusammenführen anbieten
- [x] Eingabe per Diktierfunktion der Tastatur funktioniert (keine eigene Spracherkennung)

### 1.11 Liste mit anderen teilen
- [x] Eine einzelne Liste in einen eigenen Bereich überführen und Externe einladen
- [x] Lesen ohne Google-Konto, Abhaken und Ändern mit Konto

### 1.12 Qualität
- [x] Unit-Tests: Krypto, Zusammenführen, Kategorisierung
- [x] Integrationstests: drei Geräte mit Fake-Provider, Offline-Szenarien, Rollback, untergeschobene Dateien
- [x] E2E-Tests mit Playwright: zwei Browser-Kontexte, Einladen, gemeinsames Abhaken (Google und Drive nachgebildet)
- [ ] Familientest auf Android und Desktop, mindestens zwei Wochen
- [x] `docs/threat-model.md` und den Datenschutzhinweis („welche Daten liegen wo“) aktualisieren (`docs/datenschutz.md`)

## Akzeptanzkriterien
- Bei offener App erscheinen Änderungen auf anderen Geräten nach höchstens 5 s (P90)
- Gleichzeitige Offline-Änderungen auf zwei Geräten werden ohne Verlust zusammengeführt
- Die Dateien in Google Drive sind ohne Schlüssel nicht lesbar (manuell geprüft)
- Ein neues Familienmitglied ist in unter 2 Minuten eingebunden
- Die Wiederherstellung per Code klappt auf einem frischen Gerät
- Die App ist vollständig offline nutzbar, der Sync-Status ist jederzeit erkennbar
- axe meldet keine kritischen Befunde

## Nicht Teil dieser Phase
Rezepte, Wochenplan, Import, automatischer Schlüsselwechsel.
