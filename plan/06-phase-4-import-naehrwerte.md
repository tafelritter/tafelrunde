# Phase 4 – Import und Nährwerte

## Teil A: Rezept-Import

**Ziel:** Rezepte von Seiten wie Chefkoch übernehmen, ohne sie abzutippen und ohne Server.

### 4.1 Import-Kern
- [x] schema.org/Recipe aus JSON-LD lesen (Microdata als Fallback) und daraus einen Cooklang-Entwurf erzeugen
- [x] Deutscher Parser für Zutatenzeilen: Brüche (½), Bereiche (2–3), „etwas“, „nach Belieben“, Synonyme für Einheiten (EL, Essl., g, Gramm …)
- [x] Zutaten dem Zutatenkatalog zuordnen; per Namensabgleich in die Arbeitsschritte setzen, sonst als eigenen Abschnitt anlegen
- [x] Prüfansicht vor dem Speichern; Quelle und Importdatum in den Metadaten
- [x] Bilder werden standardmäßig nicht übernommen (Urheberrecht)

### 4.2 Bookmarklet (Desktop)
- [x] Ein kleines, im Repo veröffentlichtes Skript liest die strukturierten Daten auf der Rezeptseite, öffnet die App und übergibt sie per `postMessage` mit Origin-Prüfung
- [x] Installationsseite in der App: Lesezeichen in die Leiste ziehen

### 4.3 Android und Text
- [x] Web Share Target im Manifest: markierten Rezepttext teilen startet den Text-Import
- [x] Wird nur eine URL geteilt, erscheint der Hinweis „Bitte Rezepttext markieren und teilen“
- [x] Dialog zum Einfügen von Text auf allen Geräten

### 4.4 Sicherheit und Recht
- [x] Importierte Inhalte gelten als nicht vertrauenswürdig: nur Text, Größenlimits, kein HTML
- [x] Hinweis „nur für den privaten Gebrauch“; importierte Rezepte gelangen nur in den öffentlichen Katalog, wenn die Rechte geklärt sind

## Teil B: Nährwerte und Kalorien

**Ziel:** Überblick über Nährwerte und Kalorien je Rezept, Portion und Woche.

### 4.5 Lizenzprüfung (ADR)

Recherche und Vorschlag: [ADR 0004](../docs/adr/0004-naehrwertdaten.md) – BLS 4.0 unter CC BY 4.0, Lizenz auf der Download-Seite bestätigt.

- [x] Nutzungsbedingungen des BLS 4.0 prüfen: Weitergabe im öffentlichen Repo, Vereinbarkeit mit CC BY-SA 4.0, Quellenangabe
- [x] Sind sie nicht vereinbar, Alternativen bewerten, z. B. USDA FoodData Central (gemeinfrei) mit Zuordnung deutscher Namen

### 4.6 Daten
- [x] Zuordnung Katalog-Zutat → BLS-Code
- [x] Gewichtstabelle je Zutat: Stück, EL, TL, Prise, Bund, Dose, Becher
- [x] Eigener Ordner `catalog/nutrition/` mit eigenem Lizenzhinweis

### 4.7 Berechnung
- [x] Pro Rezept und Portion, inklusive Unterrezepten
- [x] Abdeckung anzeigen („87 % der Zutaten erfasst“), Werte mit „≈“ kennzeichnen

### 4.8 Darstellung
- [x] Nährwerte in der Rezeptansicht
- [x] Tages- und Wochensumme im Plan
- [x] Sortieren und Filtern nach Kalorien

### 4.9 Qualität
- [x] Unit-Tests: Zutaten-Parser mit echten Beispielzeilen, Umrechnung, Rundung
- [x] E2E-Tests: Import per Bookmarklet (Testseite mit JSON-LD), Text-Import

## Akzeptanzkriterien
- Ein Chefkoch-Rezept liegt per Bookmarklet in unter einer Minute als bearbeitbarer Entwurf in der App
- Markierter Rezepttext unter Android ergibt einen brauchbaren Entwurf
- Die Nährwerte eines Rezepts mit Unterrezept stimmen mit einer Handrechnung überein (± 5 %)
