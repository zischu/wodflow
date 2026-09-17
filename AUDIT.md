# WODFlow v0.4.1 – technischer Roast und Fixes

## Urteil

Der MVP war funktional, aber an mehreren Stellen nur unter idealen Desktop-Bedingungen stabil.
Das größte Risiko war nicht die Optik, sondern ein Timer, dessen Wahrheit an `setInterval`
hing. Auf Android ist das eine Einladung zu falschen Intervallen, sobald der Browser einen Tab
drosselt. Gleichzeitig konnten PWA-Cache, IndexedDB-Randfälle und Editor-Speicherrennen den
Eindruck erzeugen, Daten seien gespeichert oder aktuell, obwohl der sichtbare Zustand davon
abwich.

## Kritische Befunde

### 1. Der Timer zählte Callback-Aufrufe statt reale Zeit

**Problem:** Verzögerte oder ausgesetzte JavaScript-Timer ließen Intervalle stehenbleiben oder
sprangen nicht zuverlässig über mehrere bereits vergangene Phasen.

**Fix:** Der Runner verwendet nun die Differenz realer Zeitstempel und eine reine
Zustandsmaschine. Ein einzelner Tick kann beliebig viele vergangene Phasen korrekt abarbeiten.

### 2. Ein Speichervorgang konnte das falsche Editor-Dokument verändern

**Problem:** Wurde während eines asynchronen Speichervorgangs ein anderer Entwurf geladen,
konnte die zurückkehrende ID dem neuen Dokument zugeordnet werden.

**Fix:** Jeder Editorinhalt besitzt eine interne Dokumentidentität. Das Ergebnis eines
Speichervorgangs wird nur auf das Dokument angewendet, aus dem der Snapshot stammt. Ein zweiter
Save wird währenddessen zuverlässig blockiert.

### 3. Ungespeicherte Änderungen waren zu leicht zu verlieren

**Problem:** Wechsel, Löschen, Verlaufskopie oder Tab-Schließen waren nicht konsistent gegen
Datenverlust abgesichert.

**Fix:** Baseline-/Dirty-State, Verwerfbestätigung und `beforeunload` sind jetzt konsistent.
Historienkopien und das Demo-WOD werden nicht mit bereits gespeicherten Bibliothekseinträgen verwechselt; der unveränderte Demo-Entwurf löst dabei keine unnötige Verlassenswarnung aus.

### 4. Der Service Worker konnte eine alte App konservieren

**Problem:** App-Dateien wurden cache-first beziehungsweise mit manueller Cacheversionierung
behandelt. Dadurch konnte nach einem Deployment weiterhin die alte Oberfläche erscheinen.

**Fix:** Die Service-Worker-Version stammt aus der Paketversion. App-Dateien sind network-first,
Übungsbilder stale-while-revalidate. Alte WODFlow-Caches werden gezielt entfernt; fehlerhafte
Netzwerkantworten fallen auf vorhandene Cacheeinträge zurück.

## Hohe UX- und Datenqualitätsbefunde

### 5. Mobile Navigation war eine geschrumpfte Desktop-Sidebar

**Fix:** Kompakte mobile Kopfzeile, aufklappbares Menü, Bottom-Sheet-Dialoge, Safe-Area-Abstände,
größere Touch-Ziele und ein für kleine Displays neu angeordnetes Block-/EMOM-Layout.

### 6. Übungssuche und RepDB-Sync hatten Race Conditions

**Fix:** Veraltete Suchantworten werden verworfen. Nach dem ersten oder manuellen Sync werden
Statistik und Trefferliste konsistent neu geladen. Der Exercise Manager führt beim Öffnen keine
doppelte Vollabfrage mehr aus.

### 7. IndexedDB-Öffnung konnte in einem dauerhaft abgelehnten Promise hängen

**Fix:** Fehler, Blockierung, Versionswechsel und geschlossene Verbindungen setzen den
Verbindungscache zurück. Eingebaute Übungen werden bei jeder Migration idempotent aktualisiert;
veraltete Providerdatensätze werden bereinigt.

### 8. Eigene Übungen konnten semantisch doppelt angelegt werden

**Fix:** Namen und Aliase werden diakritik- und groß-/kleinschreibungsunabhängig verglichen.
Nur eigene lokale Übungen sind löschbar; integrierte und RepDB-Datensätze bleiben geschützt.

### 9. Zahlenfelder und leere Blöcke erzeugten widersprüchliche Zustände

**Fix:** Zahlenfelder besitzen einen editierbaren Entwurf und committen erst valide ganzzahlige
Werte. Leere AMRAPs, vollständig leere EMOMs, ungültige Zeiten und leere Work/Rest-Blöcke werden
vor dem Start verständlich abgefangen.

### 10. Bilder und Dialoge scheiterten unsauber

**Fix:** Jede Übung besitzt einen visuellen Fallback bei fehlendem oder defektem Bild. Dialoge
sperren den Hintergrund, unterstützen Escape, Fokuswiederherstellung und Fokusbegrenzung. Der
Runner ist als modaler Vollbilddialog ausgezeichnet.

## Bereinigte Code-Smells

- duplizierte und sich überschreibende CSS-Schichten entfernt;
- verstreute Timerlogik in testbare Funktionen ausgelagert;
- Workout-Validierung zentralisiert;
- feste statt unkontrolliert driftende Dependency-Versionen verwendet;
- UI-Version direkt aus `package.json` abgeleitet;
- Fehler werden sichtbar gemeldet statt still verschluckt;
- deutsche Bezeichnungen und Statusmeldungen vereinheitlicht.

## Bewusst nicht Bestandteil dieses Releases

Keine neuen Produktfunktionen: kein Generator, keine Cloud-Synchronisierung, kein Account,
keine neuen Blocktypen und keine zusätzlichen Trainingsmetriken. v0.5.0 ist ausschließlich ein
Stabilitäts-, Fehlerbehebungs- und UI/UX-Release.
