# Phase 3 – Planung und Einkaufsliste aus Rezepten

**Ziel:** Der Kreislauf Planen → Einkaufen → Kochen ist geschlossen.

## Aufgaben

### 3.1 Datenmodell
- [x] Planeinträge im Dokument `live`: Datum, Mahlzeit, Rezept-Referenz, Portionen, Notiz, Status (geplant oder gekocht)
- [x] Ideen-Pool für Einträge ohne Datum

### 3.2 Wochenansicht
- [x] Tage als Karten; die Mahlzeiten legt jeder Haushalt selbst fest (z. B. nur Abendessen)
- [x] Verschieben per Drag & Drop am Desktop, mobil per Dialog
- [x] Badge „Heute kochen“ mit Sprung in den Kochmodus

### 3.3 Zur Einkaufsliste
- [x] Aus einem Rezept (mit gewählter Portionenzahl) und aus einem Zeitraum im Plan
- [x] Vorschau vor dem Übernehmen: Einträge abwählen, Mengen anpassen

### 3.4 Zusammenführen
- [x] Gleiche Zutaten über die Katalog-ID erkennen
- [x] Einheiten vereinheitlichen: Masse (g, kg), Volumen (ml, l), Stück. EL, TL und Prise bleiben getrennt, solange keine Umrechnung bekannt ist.
- [x] Herkunft je Eintrag sichtbar, z. B. „für: Pizza, Zwiebelkuchen“

### 3.5 Unterrezepte
- [x] Standard: in Einzelzutaten auflösen
- [x] Rückfrage „Hefeteig schon vorhanden?“: dann weglassen oder als einen Posten übernehmen

### 3.6 Grundvorräte
- [x] Eine Haushaltsliste „immer im Haus“ (z. B. Salz, Pfeffer, Öl); diese Zutaten werden beim Übernehmen ausgeblendet oder abgefragt

### 3.7 Änderungen nachziehen
- [x] Wird ein Rezept aus dem Plan entfernt oder ändert sich die Portionenzahl, werden die zugehörigen, noch nicht abgehakten Einträge angepasst (mit Rückfrage)

### 3.8 Nach dem Kochen
- [x] „Gekocht“ markieren: Eintrag im Koch-Protokoll, „zuletzt gekocht“ aktualisiert, optional Bewertung

### 3.9 Qualität
- [x] Unit-Tests: Einheiten, Zusammenführung, Auflösung von Unterrezepten
- [x] E2E-Tests: Woche planen, Liste erzeugen, einkaufen, kochen

## Akzeptanzkriterien
- Eine Woche mit fünf Rezepten ergibt eine Liste mit zusammengeführten Mengen, richtigen Kategorien und sichtbarer Herkunft
- Wird ein Rezept aus dem Plan entfernt, passen sich die offenen Einträge an
- Grundvorräte landen nicht ungefragt auf der Liste
