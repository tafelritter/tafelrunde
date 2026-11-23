# Google-Cloud-Projekt einrichten

Tafelrunde braucht ein kostenloses Google-Cloud-Projekt für die Drive API. Jede Instanz – auch ein Fork unter eigener Adresse – braucht ein Projekt, in dem ihre Adresse freigegeben ist. Die Werte trägt man in der App ein (Schritt 5), nicht im Build.

Client-ID und API-Key sind **öffentlich** – sie stehen in jeder Anfrage an Google und reisen in Einladungen mit. Geschützt werden sie durch die Beschränkungen unten, nicht durch Geheimhaltung.

## 1. Projekt und API

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein neues Projekt anlegen, z. B. `tafelrunde`.
2. **APIs & Dienste → Bibliothek → Google Drive API → Aktivieren.**
3. Kein Rechnungskonto verknüpfen; die Drive API ist im Rahmen der Kontingente kostenlos.

## 2. OAuth-Zustimmungsbildschirm

**APIs & Dienste → OAuth-Zustimmungsbildschirm** (bzw. „Google Auth Platform“):

| Feld                    | Wert                                                        |
| ----------------------- | ----------------------------------------------------------- |
| Nutzertyp               | Extern                                                      |
| Veröffentlichungsstatus | **Test**                                                    |
| Testnutzer              | die E-Mail-Adressen der Familie                             |
| Scopes                  | ausschließlich `https://www.googleapis.com/auth/drive.file` |
| Autorisierte Domain     | `niedermaier.bayern`                                        |

Verlangt Google eine Bestätigung der Domain, geschieht das kostenlos in der [Google Search Console](https://search.google.com/search-console) über einen DNS-TXT-Eintrag.

Im Testmodus sind höchstens 100 Testnutzer möglich, und Google zeigt einen Hinweis „App nicht überprüft“. Für die Familie ist das ausreichend.

## 3. OAuth-Client

**APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**, Typ **Webanwendung**:

| Feld                             | Werte                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Autorisierte JavaScript-Quellen  | `http://localhost:5173`, `https://tafelrunde.niedermaier.bayern`                                       |
| Autorisierte Weiterleitungs-URIs | `http://localhost:5173/auth/callback.html`, `https://tafelrunde.niedermaier.bayern/auth/callback.html` |

Es gibt **kein** Client-Secret im Code; der Token-Flow per Weiterleitung braucht keins.

## 4. API-Key

**Anmeldedaten erstellen → API-Schlüssel**, danach bearbeiten:

- **Anwendungseinschränkung:** HTTP-Verweise (Websites)
  - `http://localhost:5173/*`
  - `https://tafelrunde.niedermaier.bayern/*`
- **API-Einschränkung:** nur Google Drive API

> **Achtung, Referrer:** Die App sendet `Referrer-Policy: no-referrer`. Eine Referrer-Beschränkung greift dann nicht, weil Google keinen Referrer sieht. Ob Google die Anfrage über den `Origin`-Header zuordnet, klärt der Machbarkeitstest (siehe `docs/adr/0001-sync-google-drive.md`). Falls nicht, wird die Referrer-Policy für Anfragen an `www.googleapis.com` gezielt auf `strict-origin` gesetzt (`referrerPolicy` am `fetch`), statt die Beschränkung aufzugeben.

## 5. Werte in der App eintragen

Kein Build-Wert, keine Datei im Repository: In der App unter **„Mit Google verbinden“** Client-ID und API-Schlüssel eintragen. Die Seite zeigt dort auch genau die Adressen an, die in Schritt 3 und 4 für diese Instanz nötig sind (JavaScript-Quelle, Weiterleitungs-URI, Website-Beschränkung) – praktisch für Forks unter eigener Adresse.

- Die Werte liegen nur auf dem Gerät (`localStorage`). Das Token bleibt im Arbeitsspeicher.
- Einladungen und Wiederherstellungscodes nehmen die Werte mit: Ein neues Gerät ohne eigenes Projekt übernimmt sie beim Beitreten (mit Hinweis) und startet kurz neu. Familienmitglieder müssen also nichts einrichten.
- Für die Entwicklung unter `http://localhost:5173` dasselbe Projekt verwenden, wenn dort die lokale Adresse freigegeben ist.

Ein Gerät, das das Projekt wechselt, kann die Dateien, die es mit dem alten Projekt angelegt hat, nicht mehr ändern (Scope `drive.file` gilt je Projekt). Es legt neue Dateien an; die anderen Geräte übernehmen sie über das Register.

## 6. Kontingente beobachten

**APIs & Dienste → Google Drive API → Kontingente.** Relevant ist „Queries per minute“ pro Projekt und pro Nutzer. Die gemessenen Werte aus dem Machbarkeitstest gehören in ADR 0001.
