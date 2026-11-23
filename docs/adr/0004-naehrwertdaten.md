# ADR 0004 – Nährwertdaten: Bundeslebensmittelschlüssel 4.0

- **Status:** vorgeschlagen – alle Prüfpunkte erledigt, umgesetzt in Phase 4 Teil B; Annahme durch den Maintainer offen
- **Datum:** 2026-11-23
- **Bezug:** plan/06-phase-4-import-naehrwerte.md, 4.5

## Kontext

Phase 4 Teil B soll Nährwerte und Kalorien je Rezept, Portion und Woche zeigen. Die Leitplanken verlangen, dass die Daten **statisch in der App** liegen (kein Server, keine Abfrage bei Dritten zur Laufzeit) und im **öffentlichen Repo** gepflegt werden können. Der Katalog steht unter CC BY-SA 4.0. Gebraucht wird also eine Quelle, die

1. die Weitergabe eines Auszugs im öffentlichen Repo und in der ausgelieferten App erlaubt,
2. mit CC BY-SA 4.0 des übrigen Katalogs vereinbar ist,
3. deutsche Lebensmittelnamen und hiesige Produkte abdeckt, damit die Zuordnung zum Zutatenkatalog (294 Artikel) handhabbar bleibt.

## Recherche (Stand 2026-11-23)

### Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut (MRI)

- Seit **16. Dezember 2025** in Version 4.0 **kostenfrei** verfügbar; die bisherigen Lizenzgebühren entfallen ([heise](https://www.heise.de/en/news/Bundeslebensmittelschluessel-4-0-Nutrient-database-now-publicly-available-11123877.html), [MRI](https://www.mri.bund.de/en/institutes/nutritional-behaviour/translate-to-english-arbeitsbereiche/german-nutrient-database-bundeslebensmittelschluessel-bl/)).
- **Lizenz laut Download-Seite: CC BY 4.0, ausdrücklich für die Daten.** Wortlaut (geprüft am 2026-11-23): „Die Daten des Bundeslebensmittelschlüssels (BLS) stehen als Open Data zur freien Verfügung. Die Nutzung ist unter der Lizenz CC BY 4.0 (Creative Commons Namensnennung 4.0 International) gestattet. Bei Verwendung ist das Max Rubner-Institut als Herausgeber zu nennen.“ ([blsdb.de/download](https://blsdb.de/download))
- Die Dokumentation nennt ausdrücklich App- und Softwareentwicklung als vorgesehene Nutzung ([BLS 4.0 Dokumentation](https://www.openagrar.de/servlets/MCRFileNodeServlet/openagrar_derivate_00069363/BLS_4_0_Dokumentation_DE.pdf)).
- Zitierweise laut Download-Seite: „Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 — Deutsche Nährstoffdatenbank. Karlsruhe. DOI: [10.25826/Data20251217-134202-0](https://doi.org/10.25826/Data20251217-134202-0)“
- Umfang: gut 7 000 Lebensmittel und Gerichte mit bis zu 138 Nährstoffen, deutsche Bezeichnungen, aktualisierte Auswahl (u. a. Pflanzendrinks, Quinoa, Buchweizen).
- **Nicht bestätigt:** ob der Datensatz Stück- oder Löffelgewichte enthält. Davon gehen wir nicht aus (siehe Folgen).

### Alternativen

| Quelle                                        | Lizenz                                                                                                                                 | Bewertung                                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BLS 4.0** (MRI)                             | CC BY 4.0                                                                                                                              | deutsche Namen und Produkte, amtliche Quelle; Namensnennung nötig                                                                                                       |
| USDA FoodData Central (SR Legacy, Foundation) | CC0 1.0, gemeinfrei; Nennung erbeten ([FDC](https://fdc.nal.usda.gov/), [data.gov](https://catalog.data.gov/dataset/fooddata-central)) | rechtlich am einfachsten; englische Namen und US-Produkte – jede der 294 Zuordnungen müsste übersetzt und fachlich geprüft werden (z. B. Quark, Schmand, Mehl Type 405) |
| Open Food Facts                               | ODbL (Datenbank), Share-Alike eigener Art                                                                                              | Markenprodukte statt Grundlebensmittel; ODbL passt nicht sauber zu CC BY-SA 4.0 – verworfen                                                                             |

### Vereinbarkeit CC BY 4.0 mit CC BY-SA 4.0

CC BY 4.0 erlaubt Weitergabe und Bearbeitung, auch kommerziell, unter der Bedingung der Namensnennung, eines Lizenzhinweises und der Kennzeichnung von Änderungen. Material unter CC BY 4.0 darf in Werke unter CC BY-SA 4.0 übernommen werden. Sauberer – und für spätere Aktualisierungen einfacher – ist es, den **Auszug selbst unter CC BY 4.0 zu belassen** und nur die eigenen Ergänzungen (Zuordnung, Gewichtstabelle) unter CC BY-SA 4.0 zu stellen.

## Entscheidung (Vorschlag)

**BLS 4.0** wird die Nährwertquelle, als Auszug im Repo.

- **Ordner `catalog/nutrition/`** mit eigenem `LICENSE`-Hinweis:
  - `bls-4.0-auszug.csv` – nur die Lebensmittel, die der Zutatenkatalog braucht, und nur die angezeigten Nährstoffe (Energie, Fett, davon gesättigte Fettsäuren, Kohlenhydrate, davon Zucker, Ballaststoffe, Eiweiß, Salz), je 100 g. **Lizenz CC BY 4.0**, Herausgeber MRI, Hinweis „Auszug, gekürzt auf ausgewählte Lebensmittel und Nährstoffe“ (Kennzeichnung der Änderung).
  - `zuordnung.yaml` – Katalog-ID → BLS-Code (4.6). Eigene Arbeit, **CC BY-SA 4.0** wie der übrige Katalog.
  - `gewichte.yaml` – Gewicht je Stück, EL, TL, Prise, Bund, Dose, Becher (4.6). Eigene Werte, **CC BY-SA 4.0**; keine Übernahme aus Quellen mit unklaren Rechten.
- `REUSE.toml` bekommt eine eigene Annotation `catalog/nutrition/bls-*` → `CC-BY-4.0`, `LICENSES/CC-BY-4.0.txt` kommt dazu.
- **Namensnennung in der App:** unter jeder Nährwertanzeige „Nährwerte: Max Rubner-Institut (2025), Bundeslebensmittelschlüssel 4.0, CC BY 4.0 – Auszug“ mit Link auf die Lizenz und die DOI; zusätzlich in `catalog/README.md` und im Impressum/Über-Bereich. Kein Hinweis, der eine Unterstützung durch das MRI nahelegt.
- `tools/catalog.mjs` baut daraus `public/catalog/nutrition.json`; die Validierung prüft, dass jeder BLS-Code im Auszug existiert.

**Rückfallebene:** Ergibt die Prüfung der Originalquellen eine Einschränkung, die einen Auszug im öffentlichen Repo ausschließt, wird USDA FoodData Central (CC0) verwendet – mit derselben Ordnerstruktur, nur anderer Quelle und manueller Namenszuordnung.

## Vor der Annahme zu prüfen

Die Recherche stützte sich zunächst auf Suchergebnisse; die Originalseiten waren aus der Arbeitsumgebung nicht abrufbar. Den Text der Download-Seite hat der Maintainer am 2026-11-23 nachgereicht.

- [x] [blsdb.de/download](https://blsdb.de/download): CC BY 4.0 gilt für die **Daten** („stehen als Open Data zur freien Verfügung“). Die Seite nennt keine Zusatzbedingungen außer der Nennung des MRI als Herausgeber.
- [x] Zitierweise mit DOI (siehe oben).
- [x] Datenformat (Download `BLS_4_0_2025_DE.zip`, geprüft am 2026-11-23): eine xlsx-Datei mit 7 140 Lebensmitteln und 138 Nährstoffen, alle Werte je 100 g essbaren Anteil; Spalten `ENERCC`, `ENERCJ`, `FAT`, `FASAT`, `CHO`, `SUGAR`, `FIBT`, `PROT625`, `NACL`. **Keine Portions- oder Stückgewichte** – die Gewichtstabelle ist Eigenarbeit. Spuren (`TR`) und Werte unter der Nachweisgrenze (`<LOD`, `<LOQ`) werden als 0 übernommen; fehlende Werte (`-`) laut Dokumentation (4.3) ausdrücklich nicht als 0, die App meldet sie.
- [x] Dokumentation, Abschnitt 9.3 „Nutzungsbedingungen“: kostenfrei und ohne Lizenzbarrieren, ausdrücklich auch für App- und Softwareentwicklung; kein Haftungsausschluss, der weitergegeben werden müsste.
- [x] Lizenztext CC BY 4.0 in `LICENSES/`, REUSE-Annotation für den Auszug, Hinweis in `catalog/nutrition/LICENSE`.

## Folgen

- Ein zweiter Lizenzbereich im Katalog (CC BY 4.0 neben CC BY-SA 4.0); `catalog/README.md` und `CONTRIBUTING.md` erklären, welche Datei unter welcher Lizenz steht.
- Die **Gewichtstabelle ist Eigenarbeit** und der größere Aufwand: Ohne sie lassen sich „2 Zwiebeln“ oder „1 EL Öl“ nicht berechnen. Fehlende Werte senken die angezeigte Abdeckung („87 % der Zutaten erfasst“, 4.7), statt still zu raten.
- Aktualisierungen des BLS werden per Pull Request übernommen; das Werkzeug meldet Codes, die es im neuen Auszug nicht mehr gibt.
- Die App sendet keine Anfragen an das MRI oder Dritte; die Daten liegen statisch neben dem Zutatenkatalog und werden vom Service Worker vorgehalten.
