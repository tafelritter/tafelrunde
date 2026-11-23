# Evaluation der Idee

Stand 2026-11-20. Grundlage ist [`idea.md`](../idea.md), (+) markiert Must-haves.

## Übersicht

| Punkt | Must | Ergebnis | Phase |
|---|---|---|---|
| Rezepte anlegen und speichern | + | Cooklang, gespeichert im eigenen Drive | 2 |
| Planung kommender Rezepte | + | Wochenplan und Ideen-Pool | 3 |
| Zutaten in den Einkaufszettel übernehmen | + | aus Rezept und Plan, mit Zusammenführung | 3 |
| Einkaufszettel sortiert und gruppiert | + | Kategorien aus dem Zutatenkatalog, Reihenfolge pro Laden | 1 |
| Geteilte oder öffentliche Rezepte übernehmen und anpassen | | GitHub-Katalog und Rezept-Links, Übernahme als Kopie mit Quelle | 2 |
| Notizen und Bewertungen (privat oder geteilt) | | pro Person, sichtbar privat oder im Haushalt | 2 |
| Zutaten im Fließtext hervorgehoben | + | Inline-Syntax von Cooklang | 2 |
| Rezepte referenzieren andere Rezepte | + | Cooklang-Referenzen mit Zyklen-Erkennung | 2 |
| Sortieren, gruppieren, taggen | + | Tags, Sammlungen, Sortierung, Suche | 2 |
| Filter Fleisch, vegetarisch, vegan | | automatisch aus dem Zutatenkatalog, manuell überschreibbar | 2 |
| Nährwerte und Kalorien | | BLS 4.0, spätere Phase | 4 |
| Zugriff auf Rezepte übers Internet | | PWA, Sync über das eigene Drive | 1–2 |
| Zugriff auf Einkaufslisten übers Internet | | PWA, Sync über das eigene Drive | 1 |
| Rezepte teilen | + | Haushalt und Lese-Links für Externe | 2 |
| Einkaufslisten teilen | + | Haushalt und eigener Bereich pro geteilter Liste | 1 |
| Keine Infrastruktur, keine Kosten | + | kein Server; GitHub Pages und das Google Drive der Nutzer | 0 |
| Alexa | | **verworfen** | – |
| Import von Rezeptseiten | | Bookmarklet und Text-Import | 4 |
| Security-First | + | Ende-zu-Ende-Verschlüsselung, strikte CSP, Supply-Chain-Checks | 0–4 |
| CI/CD mit gängigen Checks | + | GitHub Actions | 0 |
| Freie Open-Source-Lizenz | + | AGPL-3.0 für Code, CC BY-SA 4.0 für Inhalte | 0 |
| Farbkonzept | | übernommen, Kontraste korrigiert | 0 |

## Kernfrage: Wo liegen die Daten?

Drei Must-haves widersprechen sich zunächst: Teilen, Zugriff übers Internet und keine Infrastruktur. Wer teilen will, braucht einen Ort, über den die Daten zwischen den Geräten laufen. In der Diskussion kam eine weitere Vorgabe hinzu: **Nutzer- und Personendaten liegen ausschließlich beim Nutzer.**

Geprüfte Optionen:

| Option | Ergebnis | Grund |
|---|---|---|
| Jazz, zentrales Firebase oder Supabase | verworfen | Die Daten lägen bei einem Dienst, nicht beim Nutzer. Supabase Free pausiert außerdem nach etwa einer Woche ohne Aktivität. |
| Eigenes Firebase-Projekt je Haushalt | verworfen | Das ist Infrastruktur, nur verlagert, und für Familien zu aufwendig einzurichten. |
| Reines Peer-to-Peer (WebRTC) | als Hauptweg verworfen | Funktioniert nur, wenn die Geräte gleichzeitig online sind. In Mobilfunknetzen braucht es oft einen kostenpflichtigen Relay-Server (TURN). |
| iCloud (CloudKit) | verworfen | Apple-Entwicklerkonto für 99 $ pro Jahr, kein Android |
| Privates GitHub-Repo mit Zugangstoken | verworfen | für Nicht-Entwickler zu technisch |
| OneDrive | zurückgestellt | Die Anmeldung hält bei Browser-Apps fest 24 Stunden. |
| Dropbox | zurückgestellt | Technisch die beste Passung: dauerhafte Anmeldung ohne Server (PKCE mit Refresh-Token). Die Familie nutzt Dropbox derzeit aber nicht. |
| **Google Drive** | **gewählt (testweise)** | Die Familie nutzt Google bereits. Die stündliche Erneuerung der Anmeldung betrifft voraussichtlich nur das Schreiben. |

Gewählte Architektur: Jedes Gerät schreibt eine verschlüsselte Datei in den eigenen Speicher und gibt sie per Lese-Link frei, die anderen lesen mit. Details stehen in [01-architektur.md](01-architektur.md).

Erkannte Haken bei Google Drive und wie die Architektur sie behandelt:

| Haken | Behandlung |
|---|---|
| Kein Push, nur Abfrage | Abfrage alle 3–5 s bei offener App, Sync-Status immer sichtbar |
| Zugriffstoken läuft nach einer Stunde ab, Browser-Apps bekommen kein Refresh-Token | Lesen läuft über einen API-Key ohne Token. Fürs Schreiben wird das Token per Weiterleitung erneuert, beim App-Start still (`prompt=none`), nur bei abgelaufener Google-Sitzung per Tipp. |
| Mit `drive.file` sieht die App keine Dateien anderer Personen | Niemand schreibt in fremde Dateien, gelesen wird über Lese-Links. |
| Google kann die Daten lesen | Ende-zu-Ende-Verschlüsselung mit einem Haushaltsschlüssel |

## Die Punkte im Einzelnen

### Plattform
- Optionen: PWA (0 €), native App (Verteilung auf iOS kostet 99 $ pro Jahr), PWA mit Android-Wrapper.
- **Entscheidung:** PWA. Ein Android-Wrapper (TWA, F-Droid) steht im Backlog.

### Rezeptformat, Zutaten im Fließtext, Referenzen (+)
- Cooklang ist ein offener Standard (MIT): `Verrühre @Mehl{500%g} mit @Wasser{300%ml}.` Die Zutaten stehen dort, wo sie verwendet werden. Referenzen auf andere Rezepte gehören zur Spezifikation, und es gibt einen offiziellen Parser als npm-Paket.
- Die Alternative, ein eigenes Datenmodell, wäre flexibler, hätte aber kein Austauschformat.
- **Entscheidung:** Cooklang, mit einem Editor, der „Zutat einfügen“ und „Rezept referenzieren“ anbietet.
- „Sich selbst referenzieren“ ist als Zyklus interpretiert und wird abgelehnt. Referenzen bilden einen gerichteten Graphen ohne Zyklen.

### Öffentliche und geteilte Rezepte, Übernahme mit Anpassung
- Ein durchsuchbarer öffentlicher Katalog in der App bräuchte Moderation, Impressum, die Pflichten aus dem DSA und einen Server. Das ist verworfen.
- **Entscheidung:** Die öffentliche Basis-Sammlung liegt als GitHub-Repo vor (CC BY-SA 4.0). Neue Rezepte kommen per Pull Request, das Review ist die Moderation, und die CI validiert. Private Rezepte teilt man per Lese-Link. Übernehmen heißt: Kopie mit Quellverweis.

### Notizen und Bewertungen
- Pro Person und Rezept, sichtbar privat (persönlicher Bereich) oder im Haushalt.

### Sortieren, Gruppieren, Taggen (+) und Ernährungsfilter
- Tags, Sammlungen, Sortierung und Volltextsuche.
- Die Ernährungsform (vegan, vegetarisch, mit Fisch, mit Fleisch) wird aus dem Zutatenkatalog abgeleitet, auch über Unterrezepte hinweg, und lässt sich manuell überschreiben.

### Planung und Einkaufsliste (+)
- Wochenplan mit Ideen-Pool. Die Einkaufsliste entsteht aus einem Rezept oder einem Zeitraum im Plan.
- Gleiche Zutaten werden zusammengeführt, dafür werden die Einheiten vereinheitlicht.
- Gruppiert wird über die Kategorien im Zutatenkatalog. Korrekturen merkt sich der Haushalt, und die Reihenfolge der Kategorien lässt sich pro Laden einstellen.
- Unterrezepte werden standardmäßig aufgelöst, mit der Rückfrage „schon vorhanden?“.

### Nährwerte und Kalorien
- Der Bundeslebensmittelschlüssel 4.0 ist seit Dezember 2025 kostenfrei nutzbar: über 7.000 Lebensmittel mit deutschen Namen. Ein Auszug kann statisch in der App liegen.
- Aufwendig ist die Umrechnung von Stück- und Löffelangaben in Gramm.
- **Entscheidung:** Phase 4, vorher wird die Lizenz geprüft.

### Import von Rezeptseiten
- Rezeptseiten enthalten meist strukturierte Daten (schema.org/Recipe). Eine PWA darf fremde Seiten aber nicht direkt laden (CORS).
- Optionen: Bookmarklet, Teilen-Menü (nur Android), Proxy (wäre Infrastruktur), Text einfügen.
- **Entscheidung:** Bookmarklet am Desktop, Text teilen oder einfügen unter Android. Kein Proxy.
- Rechtlich: nur für den privaten Gebrauch, einzelne Seiten per Klick, die Quelle wird gespeichert, importierte Rezepte kommen nicht in den öffentlichen Katalog.

### Alexa
- Amazon hat am 1.7.2024 den Zugriff von Drittanbietern auf die Alexa-Listen abgeschaltet. Möglich wäre nur noch ein eigener Skill („Alexa, sag Tafelrunde …“), der bei Amazon läuft und den Haushaltsschlüssel bräuchte.
- **Entscheidung:** verworfen, weil das der Vorgabe „Daten ausschließlich beim Nutzer“ widerspricht. Sprache bleibt über die Diktierfunktion der Tastatur möglich.

### Security-First (+)
- Ende-zu-Ende-Verschlüsselung, kleinste Berechtigung (`drive.file`), keine Fremdskripte, strikte Content-Security-Policy, Darstellung ohne HTML-Rendering, Supply-Chain-Checks. Details im [Sicherheitskonzept](01-architektur.md#sicherheitskonzept).

### CI/CD (+)
- GitHub Actions, für öffentliche Repos kostenlos. Der Umfang steht in [Phase 0](02-phase-0-fundament.md).

### Lizenz (+)
- Code unter AGPL-3.0, Rezepte und Zutatenkatalog unter CC BY-SA 4.0. Lizenziert wird pro Datei nach der REUSE-Spezifikation.

### Farbkonzept
Das Konzept ist übernommen. Die WCAG-Kontraste sind nachgerechnet (Ziel: 4,5:1 für Text, 3:1 für große Schrift und Bedienelemente):

| Kombination | Kontrast | Bewertung |
|---|---|---|
| Text und Text-secondary, beide Modi | 5,6 – 15,7 | ✓ |
| Weiß auf Primärgrün (Light) | 6,4 | ✓ |
| Weiß auf #52B788 (Button im Dark Mode) | 2,5 | ✗ → dunkler Text #141715 ergibt 7,3 |
| Terrakotta #D96B43 als Text, Weiß auf Terrakotta | 3,4 | nur für Icons und große Schrift; Textvariante #B4532F (4,7) |
| Abgehakt: Light #A3A8A5, Dark #4A524D | 2,4 / 2,0 | Vorschlag #8A908C / #6E7771 (etwa 3:1) |
| Rahmen #E6E2DC / #2E3531 | 1,2 | nur als Deko; Eingabefelder #868E89 / #68726C (mindestens 3:1) |
| Pastell-Badges mit dunklem Text | 6,5 – 9,5 | ✓ |

Ergänzt sind Farben für Fehler, Warnung und Erfolg sowie ein Fokus-Ring. Die Token-Tabelle steht in [Phase 0](02-phase-0-fundament.md#09-design-tokens).

## Quellen

- [Jazz Pricing](https://jazz.tools/pricing), [Jazz Sync & Storage](https://jazz.tools/docs/sync-and-storage)
- [Supabase: Pausieren von Free-Projekten](https://supabase.com/kb/faqs/platform/free-project-pausing)
- [Alexa: Deprecated Features](https://developer.amazon.com/de-DE/docs/alexa/ask-overviews/deprecated-features.html), [AnyList zum Alexa-Update 2024](https://help.anylist.com/articles/alexa-skill-update-july-2024/)
- [heise: BLS 4.0 frei verfügbar](https://heise.de/-11123877), [blsdb.de](https://blsdb.de)
- [@cooklang/cooklang](https://socket.dev/npm/package/@cooklang/cooklang), [Cooklang: Parser-Integration](https://cooklang.org/blog/44-cooklang-parser-integration-guide/)
- [Google: Authorizing for Web](https://developers.google.com/identity/oauth2/web/guides/overview)
- [Dropbox-Forum: Refresh-Token ohne App-Secret](https://www.dropboxforum.com/discussions/101000014/using-refresh-token-without-client-secret/584036), [Dropbox-Forum: App-Ordner und Freigaben](https://www.dropboxforum.com/t5/Dropbox-API-Support-Feedback/Sharing-how-to-share-a-folder-with-edit-access-when-don-t-know/m-p/408485)
- [Microsoft: Token-Laufzeiten bei SPAs](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/token-lifetimes)
- [Trystero](https://github.com/dmotz/trystero)
