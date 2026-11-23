# Sicherheit

Tafelrunde verschlüsselt Nutzerdaten Ende-zu-Ende und betreibt keinen Server. Das Bedrohungsmodell steht in [docs/threat-model.md](docs/threat-model.md).

## Unterstützte Versionen

Unterstützt wird nur die jeweils aktuelle Version unter `https://tafelrunde.niedermaier.bayern`.

## Schwachstelle melden

Bitte **kein öffentliches Issue** anlegen. Melde Schwachstellen über GitHubs private Meldefunktion:
**Security → Report a vulnerability** in diesem Repository.

Hilfreich sind: betroffene Version, Schritte zur Reproduktion, erwartete und tatsächliche Wirkung.

- Eingangsbestätigung: innerhalb von 7 Tagen
- Einschätzung und Plan: innerhalb von 30 Tagen
- Veröffentlichung koordiniert nach dem Fix, mit Nennung, wenn gewünscht

## Im Fokus

- Entschlüsselung oder Manipulation synchronisierter Dateien ohne Bereichsschlüssel
- XSS, insbesondere über geteilte oder importierte Rezepte
- Abfluss von Bereichsschlüsseln oder OAuth-Tokens
- Umgehung der CSP oder der Frame-Erkennung
- Supply-Chain-Risiken im Build

Nicht im Fokus: Angriffe, die bereits volle Kontrolle über ein Mitgliedsgerät voraussetzen, sowie die dokumentierten Metadaten beim Speicheranbieter.
