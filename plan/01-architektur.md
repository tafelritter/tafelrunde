# Architektur

## Überblick

```
┌───────────────────────────────┐        ┌────────────────────────────────┐
│ GitHub (öffentlich)           │        │ Google Drive jeder Person      │
│ - App-Code (AGPL-3.0)         │        │ - eine verschlüsselte Datei    │
│ - Rezept-Katalog (CC BY-SA)   │        │   pro Gerät, Bereich, Dokument │
│ - CI baut App und Katalog     │        │ - Freigabe „Jeder mit Link:    │
│ - GitHub Pages liefert aus    │        │   Lesen“                       │
└───────────────┬───────────────┘        └───────────────▲────────────────┘
                │ lädt App und Katalog                   │ schreibt eigene Datei (OAuth, drive.file)
                ▼                                        │ liest fremde Dateien (API-Key, ohne Login)
        ┌────────────────────────────────────────────────┴─┐
        │ PWA auf dem Gerät (Vue 3)                        │
        │ - lokale Daten in IndexedDB (Yjs)                │
        │ - Verschlüsselung per WebCrypto (AES-256-GCM)    │
        │ - funktioniert offline                           │
        └──────────────────────────────────────────────────┘
```

Das Projekt betreibt keinen Server. GitHub liefert nur statische Dateien aus und enthält keine Nutzerdaten.

## Code-Struktur

```
/
├─ src/
│  ├─ core/        Domäne ohne Framework-Abhängigkeit, testbar ohne Vue
│  │  ├─ crypto/   AES-GCM, Schlüssel, Codecs
│  │  ├─ sync/     Sync-Engine, Interface StorageProvider
│  │  ├─ model/    Bereiche, Listen, Rezepte, Plan (Yjs-Schemas)
│  │  ├─ recipe/   Cooklang-Kapselung, Skalierung, Referenzen
│  │  └─ catalog/  Zutatenkatalog, Kategorien, Ernährungsform
│  ├─ providers/   gdrive/ (später dropbox/, webdav/)
│  ├─ ui/          Vue-Komponenten, Ansichten, Design-Tokens
│  └─ app/         Router, Start, PWA
├─ catalog/        öffentliche Rezepte (.cook) und Zutatenkatalog (CC BY-SA 4.0)
├─ tools/          Katalog validieren und bauen (Node)
├─ docs/           ADRs, Bedrohungsmodell, Setup-Anleitungen
└─ plan/           diese Planung
```

Regel: `core` importiert nichts aus `ui` oder `providers`. So bleibt der Speicheranbieter austauschbar. ESLint setzt die Regel durch.

## Datenmodell

### Bereiche

Alles Geteilte lebt in einem **Bereich**. Ein Bereich hat eine zufällige ID, einen eigenen Schlüssel und ein Register seiner Mitglieder (Geräte).

| Bereich | Mitglieder | Inhalt |
|---|---|---|
| Persönlich | nur die eigenen Geräte | private Rezepte, private Notizen, persönliche Einstellungen |
| Haushalt | die Familie | gemeinsame Listen, Wochenplan, Rezepte, geteilte Notizen und Bewertungen, Kategorien-Zuordnungen, Läden |
| Geteilte Liste | Haushalt und Externe | eine einzelne Einkaufsliste, z. B. für ein Grillfest mit Freunden |
| Rezept-Freigabe | nur der Ersteller schreibt, Empfänger lesen | ein Rezept samt referenzierter Unterrezepte |

### Dokumente

Jeder Bereich besteht aus Yjs-Dokumenten, getrennt nach Änderungshäufigkeit:

| Dokument | Inhalt | Abfrage-Intervall |
|---|---|---|
| `live` | Mitglieder, Listen, Einträge, Wochenplan, Einstellungen | 3 s in der Listenansicht, sonst 15 s |
| `library` | Rezepte (Cooklang-Quelltext als `Y.Text` mit Metadaten), Notizen, Bewertungen, Koch-Protokoll | 30 s, sofort beim Öffnen |

Bilder (ab Phase 2) liegen als eigene verschlüsselte Dateien und werden nur bei Bedarf geladen.

### Mitglieder-Register

Liegt im Dokument `live`:

```
members: Map<deviceId, {
  person, geraetename, provider,
  dateien: { live, library },
  beigetreten, entfernt?
}>
```

## Sync-Protokoll

### Grundprinzip

1. Jedes Gerät hält jeden seiner Bereiche vollständig lokal in IndexedDB.
2. Pro Bereich und Dokument schreibt jedes Gerät **eine eigene Datei** in das eigene Drive. Sie liegt im Ordner `Tafelrunde/` und hat einen zufälligen Namen ohne Personenbezug.
3. Die Datei enthält den **vollständigen, zusammengeführten Stand** des Dokuments (`Y.encodeStateAsUpdate`), verschlüsselt. Jede einzelne Datei reicht also, um einen Bereich wiederherzustellen.
4. Die anderen Geräte lesen diese Dateien über den Lese-Link und führen sie mit `Y.applyUpdate` zusammen. Das funktioniert unabhängig von Reihenfolge und Wiederholung.
5. Da jedes Gerät nur seine eigene Datei schreibt, gibt es keine Schreibkonflikte.

### Dateiformat

```json
{
  "v": 1,
  "space": "<spaceId>",
  "doc": "live",
  "device": "<deviceId>",
  "seq": 1842,
  "iv": "<base64url, 12 Byte>",
  "ct": "<base64url, AES-256-GCM>"
}
```

- **AAD** ist `tafelrunde/v1/<space>/<doc>/<device>/<seq>`. Das bindet den Inhalt an Bereich, Dokument, Gerät und Version. Eine vertauschte oder umbenannte Datei lässt sich deshalb nicht entschlüsseln.
- **`seq`** steigt monoton. Ein lesendes Gerät verwirft jede Datei, deren `seq` kleiner ist als die zuletzt gesehene. Das schützt gegen das Zurückspielen alter Stände.
- Dateien, die sich nicht entschlüsseln lassen, werden ignoriert und im Sync-Status gemeldet.

### Schreiben

- Auslöser ist eine lokale Änderung. Geschrieben wird mit 1,5 s Verzögerung (Entprellung) und höchstens ein Vorgang gleichzeitig.
- Beim ersten Mal legt das Gerät die Datei mit `files.create` im App-Ordner an und setzt danach mit `permissions.create` die Freigabe `anyone`/`reader`.
- Danach genügt `files.update` (Upload des neuen Inhalts).
- Ohne gültiges Token bleiben Änderungen lokal. Der Status zeigt „Anmeldung nötig“, ein Tipp erneuert das Token.

### Lesen

- Für jede Datei der anderen Mitglieder werden die Metadaten abgefragt: `files.get?fields=modifiedTime,size,md5Checksum&key=<API-Key>`. Hat sich etwas geändert, lädt die App den Inhalt über `alt=media`.
- Dafür ist kein OAuth-Token nötig. Lesen funktioniert also auch ohne Anmeldung und ohne Google-Konto.
- Abgefragt wird nur, solange die App sichtbar ist (Page Visibility API). Beim Zurückkehren in die App wird sofort abgefragt, bei Fehlern mit exponentiell wachsendem Abstand.

### Sync-Status in der Oberfläche

Immer sichtbar, mit dem Zeitpunkt des letzten Abgleichs:

`synchron` · `Änderungen ausstehend` · `offline` · `Anmeldung nötig` · `Mitglied nicht erreichbar`

## Verschlüsselung und Schlüssel

- WebCrypto, keine Fremdbibliothek. AES-256-GCM mit einem zufälligen 96-Bit-IV pro Schreibvorgang.
- Jeder Bereich hat einen zufälligen 256-Bit-Schlüssel. Er verlässt das Gerät nur über eine Einladung oder den Wiederherstellungscode.

### Einladen

1. Gerät A zeigt einen QR-Code oder Link: `…/#/beitreten/<payload>`. Er enthält Bereich-ID, Schlüssel und die Datei-IDs von A. Der Schlüssel steht im URL-Fragment und wird nie an einen Server gesendet.
2. Gerät B liest die Dateien von A und hat damit den vollständigen Stand. Es trägt sich ins Register ein und legt eigene Dateien an.
3. B zeigt einen **Antwort-Code** (QR oder Link) mit seinen Datei-IDs. A scannt ihn und nimmt B ins Register auf. Alle weiteren Geräte erfahren über A von B.
4. Der Antwort-Code muss nicht geheim sein: Eine untergeschobene Datei ohne den richtigen Schlüssel lässt sich nicht entschlüsseln und wird ignoriert.

Bevorzugt wird der QR-Code. Links im Messenger-Verlauf enthalten den Schlüssel, darauf weist die Oberfläche hin.

### Entfernen und Schlüsselwechsel

- **Phase 1 (manuell):** Das Gerät wird im Register als entfernt markiert. Ein neuer Schlüssel wird erzeugt, und die verbleibenden Geräte übernehmen ihn per QR-Scan.
- **Backlog (automatisch):** Jedes Gerät bekommt ein X25519-Schlüsselpaar. Der neue Bereichsschlüssel wird für jedes verbleibende Gerät einzeln verschlüsselt verteilt.
- Ein entferntes Mitglied behält, was es bereits gesehen hat. Das lässt sich nicht verhindern und ist dokumentiert.

### Wiederherstellung

- Pro Bereich gibt es einen **Wiederherstellungscode** (QR zum Ausdrucken) mit Bereich-ID, Schlüssel und den bekannten Datei-IDs.
- Gehen alle Geräte verloren, stellt der Code den Bereich aus den Dateien in Drive wieder her.
- Ohne Code und ohne Gerät sind die Daten nicht mehr lesbar. Das ist die Folge der Ende-zu-Ende-Verschlüsselung.

## Google-Integration

- Ein kostenloses Google-Cloud-Projekt mit Drive API, OAuth-Client (Typ Web) und API-Key. Client-ID und API-Key sind öffentlich, das ist so vorgesehen. Der API-Key ist auf die Drive API und die Origins der App beschränkt.
- Scope ausschließlich `drive.file`: Die App sieht nur Dateien, die sie selbst angelegt hat.
- Der OAuth-Zustimmungsbildschirm bleibt zunächst im Testmodus, mit der Familie als Testnutzer.
- Forks verwenden ein eigenes Cloud-Projekt. Die Konfiguration kommt über Build-Variablen.

### Login per Weiterleitung

Entschieden: OAuth-Weiterleitung (`response_type=token`) ohne Bibliothek. Damit lädt die App kein Skript von Google, und die CSP bleibt streng.

1. Die App merkt sich die aktuelle Ansicht und einen zufälligen `state` in `sessionStorage` und leitet zu `accounts.google.com` weiter.
2. Google leitet zurück auf die eigene Seite `auth/callback.html`. Sie liegt bewusst außerhalb des Routers, weil die Antwort im URL-Fragment steht und sonst mit dem Hash-Routing kollidiert.
3. Die Callback-Seite prüft `state`, übernimmt Token und Ablaufzeit und entfernt beides sofort per `history.replaceState` aus der URL. Danach springt sie zurück in die gemerkte Ansicht.
4. **Stille Erneuerung:** Fehlt beim Start oder bei der Rückkehr in die App ein gültiges Token und liegen Änderungen zum Schreiben an, leitet die App mit `prompt=none` weiter. Besteht die Google-Sitzung noch, geschieht das ohne Eingabe.
5. Antwortet Google mit `login_required`, `consent_required` oder `interaction_required`, zeigt der Sync-Status „Anmeldung nötig“. Ein Tipp startet dann die normale Anmeldung.
6. Während eine Eingabe läuft, wird nie weitergeleitet. Die Daten liegen ohnehin lokal in IndexedDB.

Noch offen (klärt der Machbarkeitstest): ob das Token nur im Arbeitsspeicher liegt oder bis zum Ablauf in IndexedDB. Abzuwägen sind Komfort und das Diebstahlrisiko bei XSS.

## Hosting

- **GitHub Pages** unter der eigenen Subdomain `tafelrunde.niedermaier.bayern` (der Name ist noch änderbar).
- **Warum eine eigene Domain:** Alle Pages-Seiten unter `<konto>.github.io` teilen sich eine Herkunft und damit den lokalen Speicher, in dem die Schlüssel liegen. Die eigene Subdomain ist eine exklusive Herkunft. Die Adresse unter github.io leitet automatisch dorthin um.
- **Kosten und Aufwand:** keine. GitHub stellt das HTTPS-Zertifikat (Let's Encrypt) selbst aus und erneuert es. Nötig ist nur ein DNS-Eintrag (CNAME auf `<konto>.github.io`).
- **Router im Hash-Modus:** GitHub Pages kennt keinen Fallback für Single-Page-Apps. Hash-Routing braucht keinen, und Einladungsdaten im Fragment erreichen nie einen Server.
- **Grenzen von GitHub Pages:** Eigene HTTP-Header sind nicht möglich. Deshalb gilt:
  - Die CSP steht als `<meta http-equiv>` ganz am Anfang des `<head>`.
  - Da `frame-ancestors` per Meta-Tag nicht geht, erkennt ein Skript, ob die App in einem fremden Frame läuft, und rendert dann nichts.
  - Referrer-Policy per `<meta name="referrer" content="no-referrer">`.
- **Domain absichern:** Wer DNS kontrolliert, kontrolliert die Herkunft und damit den Zugriff auf die lokalen Schlüssel. Deshalb Zwei-Faktor-Anmeldung beim Domain-Anbieter und die Domain bei GitHub verifizieren, damit sie niemand anderes für Pages beanspruchen kann.

## Katalog-Pipeline

```
catalog/recipes/**/*.cook  ─┐
catalog/ingredients/*.yaml ─┼─► tools/catalog validate ─► tools/catalog build ─► public/catalog/*.json ─► GitHub Pages
catalog/images/*           ─┘   (CI bei jedem PR)
```

- **Validierung:** Cooklang-Syntax, Pflichtfelder, bekannte Zutaten, auflösbare Referenzen, keine Zyklen, Bildgrößen, Lizenzangaben.
- **Eintrag im Zutatenkatalog:** ID, Name, Synonyme, Kategorie, Ernährungsform, typische Einheiten. Ab Phase 4 kommen Nährwert-Zuordnung und Stückgewichte dazu.
- Die App lädt den Katalog als statische Datei und hält ihn über den Service Worker im Cache.

## Sicherheitskonzept

**Vertrauensmodell:** Die Mitglieder eines Bereichs vertrauen einander. Nicht vertrauenswürdig sind der Speicheranbieter, das Netzwerk, Empfänger eines Lese-Links ohne Schlüssel und importierte Inhalte.

| Bedrohung | Maßnahme |
|---|---|
| Speicheranbieter liest Daten | Ende-zu-Ende-Verschlüsselung, neutrale Dateinamen |
| Lese-Link gelangt an Fremde | Inhalt ist verschlüsselt, der Link allein nützt nichts |
| Einladungslink im Messenger-Verlauf | QR-Code bevorzugt, Hinweis in der Oberfläche, Schlüsselwechsel bei Verdacht |
| Manipulierte, vertauschte oder alte Dateien | Authentizität durch GCM, AAD-Bindung, monotones `seq` |
| XSS über geteilte oder importierte Rezepte | kein `v-html`, Cooklang wird als Text dargestellt, CSP ohne `unsafe-inline` und `unsafe-eval`, Trusted Types wo möglich |
| Token-Diebstahl | Scope `drive.file`, Token-Laufzeit 1 h, strikte CSP, keine Fremdskripte, Token sofort aus der URL entfernt, `state`-Prüfung gegen untergeschobene Antworten |
| Supply-Chain | Lockfile, Renovate, Dependency Review, OSV-Scanner, per SHA gepinnte Actions, minimale Workflow-Rechte, Build-Provenance |
| Verlust aller Geräte | Wiederherstellungscode |
| Clickjacking | GitHub Pages erlaubt kein `frame-ancestors`; die App erkennt fremde Frames per Skript und rendert dann nicht |
| Übernahme von Domain oder DNS | Zwei-Faktor-Anmeldung beim Domain-Anbieter, Domain bei GitHub verifiziert |
| Metadaten beim Anbieter | Dateigröße, Änderungszeit und Zugriffe bleiben sichtbar; dokumentiert |

Das ausführliche Bedrohungsmodell entsteht in `docs/threat-model.md` und wird mit jeder Phase fortgeschrieben.

## Risiken

| Risiko | Wahrscheinlichkeit | Auswirkung | Gegenmaßnahme |
|---|---|---|---|
| Lesen per API-Key oder CORS funktioniert nicht wie erwartet | mittel | hoch | Machbarkeitstest zuerst; Ausweichen auf Dropbox |
| Token-Erneuerung ist im Alltag zu lästig | mittel | mittel | Redirect-Variante, Token bis Ablauf speichern; Dropbox als zweiter Anbieter |
| Google ändert Drive-API, Scopes oder Kontingente | gering | hoch | austauschbare Sync-Schicht |
| Google stellt den Token-Flow per Weiterleitung (Implicit Flow) ein | gering | hoch | Ausweichen auf Google Identity Services (Popup); Login ist hinter dem Provider gekapselt |
| Kontingent des Cloud-Projekts reicht bei vielen Nutzern nicht | gering | mittel | Abfrage-Intervalle passen sich an; Forks nutzen ein eigenes Projekt |
| Yjs-Dokumente wachsen | mittel | gering | Garbage Collection aktiv, Trennung `live`/`library`, später Funktion zum Neuaufbau |
| Datenverlust durch verlorenen Schlüssel | gering | hoch | Wiederherstellungscode, Hinweis beim Einrichten |
| Cooklang-Parser passt nicht (Referenzen, Skalierung) | gering | mittel | Parser-ADR in Phase 2, Kapselung hinter eigener Schnittstelle |

## Offene Punkte (Klärung in Phase 0)

- Ort der Token-Speicherung: Arbeitsspeicher oder IndexedDB bis zum Ablauf
- Endgültiger Name der Subdomain
- Schrift: Systemschrift oder eine selbst gehostete Schrift unter offener Lizenz
- Rechtliches: Solange die App privat in der Familie genutzt wird, unkritisch. Wird sie darüber hinaus angeboten, sind Impressum und Datenschutzerklärung zu prüfen, denn GitHub verarbeitet beim Ausliefern IP-Adressen.
