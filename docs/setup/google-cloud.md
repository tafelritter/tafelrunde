# Google-Cloud-Projekt einrichten

Tafelrunde braucht ein kostenloses Google-Cloud-Projekt für die Drive API. Forks richten ein eigenes Projekt ein und tragen dessen Werte in die Build-Variablen ein.

Client-ID und API-Key sind **öffentlich** – sie stehen im ausgelieferten JavaScript. Geschützt werden sie durch die Beschränkungen unten, nicht durch Geheimhaltung.

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

## 5. Werte eintragen

Lokal in `.env.local` (nicht eingecheckt):

```sh
VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIza...
```

Für das Deployment im GitHub-Repository unter **Settings → Secrets and variables → Actions → Variables** (bewusst Variablen, keine Secrets, weil die Werte öffentlich sind):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_API_KEY`

## 6. Kontingente beobachten

**APIs & Dienste → Google Drive API → Kontingente.** Relevant ist „Queries per minute“ pro Projekt und pro Nutzer. Die gemessenen Werte aus dem Machbarkeitstest gehören in ADR 0001.
