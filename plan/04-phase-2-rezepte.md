# Phase 2 – Rezepte

**Ziel:** Rezepte erfassen, anzeigen, organisieren und teilen: mit Zutaten im Fließtext, Referenzen auf andere Rezepte und der öffentlichen Basis-Sammlung auf GitHub.

## Aufgaben

### 2.1 Cooklang-Parser (ADR)
- [x] `@cooklang/cooklang` (offiziell, WASM) und `@tmlmt/cooklang-parser` (TypeScript, mit Skalierung) vergleichen: Referenzen, Skalierung, fixe Mengen, Fehlermeldungen, Bundle-Größe, Lizenz, Pflege
- [x] Den Parser hinter einer eigenen Schnittstelle in `src/core/recipe` kapseln
- [x] Konventionen festlegen: Front Matter (Titel, Portionen bzw. Ausbeute, Zeiten, Tags, Quelle), deutsche Einheiten, Referenzpfade für Katalog- und eigene Rezepte

### 2.2 Dokument `library`
- [x] Rezepte (Cooklang-Quelltext als `Y.Text` mit Metadaten), Notizen, Bewertungen, Koch-Protokoll
- [x] Eigene Datei je Gerät, langsameres Abfrage-Intervall als bei `live`

### 2.3 Rezeptansicht
- [x] Zutaten im Fließtext hervorgehoben, Mengen in `--text`
- [x] Portionen skalieren; fixe Mengen wie eine Prise skalieren nicht mit
- [x] Abgeleitete Zutatenliste, Abschnitte, Kochgeschirr, antippbare Timer
- [x] Kochmodus: Bildschirm bleibt an (Wake Lock), große Schrift, Schritt für Schritt

### 2.4 Editor
- [x] CodeMirror 6 mit Cooklang-Hervorhebung, Live-Vorschau und Fehlern direkt im Text
- [x] Dialoge „Zutat einfügen“ (Vorschläge aus dem Katalog, Menge, Einheit) und „Rezept referenzieren“
- [x] Formular für die Metadaten

### 2.5 Referenzen
- [x] Auflösung gegen den Katalog und die eigenen Bereiche
- [x] Zyklen beim Speichern erkennen und verständlich melden
- [x] Skalierung relativ zur Ausbeute des Unterrezepts, z. B. 500 g von 800 g Hefeteig
- [x] Anzeige als Link mit aufklappbarer Zutatenliste
- [x] Rekursive Auflösung für Zutatenliste und Ernährungsform

### 2.6 Organisation und Suche
- [x] Tags und Sammlungen
- [x] Sortierung nach Name, Bewertung, zuletzt gekocht, Zubereitungszeit, neueste
- [x] Volltextsuche (z. B. MiniSearch); Filter nach Tags, Ernährungsform und Zeit

### 2.7 Ernährungsform
- [x] Den Zutatenkatalog um die Ernährungsform erweitern: vegan · vegetarisch · mit Fisch · mit Fleisch
- [x] Ein Rezept erbt die strengste Stufe seiner Zutaten, auch über Referenzen; unbekannte Zutaten werden markiert; manuelle Überschreibung möglich

### 2.8 Notizen und Bewertungen
- [x] Pro Person eine Notiz und 1–5 Sterne, sichtbar privat oder im Haushalt
- [x] Durchschnitt im Haushalt, „zuletzt gekocht“

### 2.9 Fotos
- [x] Im Browser verkleinert (WebP, höchstens 1600 px) und als eigene verschlüsselte Datei im Drive der Person gespeichert, die das Foto hinzufügt; Laden über Lese-Link, lokaler Cache
- [x] Fotos im Katalog liegen im Repo, mit Größenlimit und Lizenzangabe

### 2.10 Öffentlicher Katalog auf GitHub
- [x] `catalog/recipes/**/*.cook` mit Front Matter
- [x] `tools/catalog validate` und `build` mit demselben Parser wie die App; CI-Job bei jedem PR
- [x] PR-Vorlage „Neues Rezept“ und Beitragsanleitung mit Lizenzhinweis (nur eigene Texte und Fotos)
- [x] Erste Rezepte der Familie einpflegen, z. B. einen Hefeteig und einen Kuchen, der ihn referenziert

### 2.11 Übernehmen und Anpassen
- [x] Ein Katalog- oder geteiltes Rezept als Kopie in einen Bereich übernehmen; Quelle und Version stehen in den Metadaten
- [x] Hinweis, wenn sich das Original geändert hat

### 2.12 Rezepte teilen
- [x] Rezept-Freigabe: eigener Bereich (nur Lesen) mit Link oder QR-Code; referenzierte Unterrezepte werden mitgeteilt
- [x] Empfänger brauchen zum Lesen kein Konto und können das Rezept übernehmen
- [x] Einzelne Rezepte als `.cook` exportieren und importieren; alle Rezepte als ZIP exportieren (Backup)

### 2.13 Qualität
- [x] Unit-Tests: Skalierung, Referenzen, Zyklen, Ernährungsform
- [x] E2E-Tests: Rezept anlegen, referenzieren, teilen, übernehmen
- [x] Bedrohungsmodell: Rezepttext und Fotos als nicht vertrauenswürdige Eingabe, Größenlimits

## Akzeptanzkriterien
- Kuchen mit Referenz auf Hefeteig: Die Mengen skalieren korrekt, ein Zyklus wird abgelehnt
- Steckt Butter im referenzierten Teig, erscheint das Rezept nicht im Vegan-Filter
- Ein Katalog-PR mit einer nicht auflösbaren Referenz schlägt in der CI fehl
- Ein Rezept-Link öffnet sich beim Empfänger ohne Anmeldung
- Rezepttext mit HTML oder Skript wird als reiner Text angezeigt
