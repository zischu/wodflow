# WODFlow

Aktuelle Version: **v0.5.0**

WODFlow ist eine lokale Progressive Web App zum grafischen Zusammenstellen und Ausführen von
Intervall-Workouts. Die Anwendung wird vollständig als statische Website auf GitHub Pages betrieben.
Backend, Datenbankserver und Docker sind nicht erforderlich.

## Kernfunktionen

- Grafischer WOD-Editor mit sortierbaren Blöcken
- Timer, AMRAP, Work/Rest und frei definierbare EMOM-Sequenzen
- Übungen und optionale Wiederholungszahlen pro Block beziehungsweise EMOM-Intervall
- Vollbild-Runner mit Pause, Zurücksetzen, Überspringen und Screen Wake Lock
- Lokaler Trainingsverlauf für abgeschlossene und abgebrochene Einheiten
- Lokale WOD- und Übungsdatenbank in IndexedDB
- Übungsverwaltung mit RepDB-Synchronisierung und eigenen Übungen
- Installierbare PWA mit offlinefähiger App-Shell und Bildcache
- Sichtbare Versionsnummer im UI

## v0.5.0 – Stabilitäts- und UX-Release

Diese Version fügt bewusst keine neue Produktfunktion hinzu. Sie behebt insbesondere:

- unzuverlässige Timerfortschreibung nach Android-Hintergrunddrosselung;
- Speicherrennen zwischen zwei im Editor geöffneten WODs;
- fehlende Warnungen bei ungespeicherten Änderungen;
- veraltete PWA-Dateien durch eine zu aggressive Cache-Strategie;
- unzuverlässige Aktualisierung nach dem ersten RepDB-Import;
- ungenaue Übungsstatistiken und doppelte eigene Übungen;
- fehleranfällige Zahlenfelder und ungültige leere Trainingsblöcke;
- unbrauchbare mobile Sidebar, zu kleine Touch-Ziele und überlagerte Dialoginhalte;
- fehlende Bild-Fallbacks sowie unvollständige Tastatur- und Dialogbedienung.

Die vollständige technische Review steht in [`AUDIT.md`](AUDIT.md).

## Architektur

```text
GitHub Pages
    |
    v
React + TypeScript PWA
    |
    +-- IndexedDB
    |     +-- workouts
    |     +-- history
    |     `-- exercises
    |
    +-- Service Worker
    |     +-- App-Shell
    |     `-- bereits geladene Übungsbilder
    |
    `-- optionaler RepDB-Free-Sync
```

## Deployment auf GitHub Pages

Der Workflow `.github/workflows/deploy-pages.yml` baut `frontend/` bei jedem Push auf `main`
und veröffentlicht `frontend/dist` über GitHub Pages.

```bash
cd ~/wodflow
git add .
git commit -m "Fix timer reliability and mobile UX"
git push
gh run watch
```

Die Anwendung liegt anschließend typischerweise unter:

```text
https://<github-user>.github.io/wodflow/
```

## Lokale Entwicklung

```bash
cd frontend
npm install
npm run dev
```

Prüfen und bauen:

```bash
npm run typecheck
npm run build
```

## Lokale Daten

Alle Nutzerdaten liegen in der Browserdatenbank `wodflow`:

- Es ist kein Konto erforderlich.
- WODs, Verlauf und Übungsmetadaten bleiben offline verfügbar.
- Zwischen Geräten findet keine automatische Synchronisierung statt.
- Das Löschen der Browser-/Websitedaten entfernt auch die lokalen WODFlow-Daten.

## RepDB-Attribution

Übungsdaten und Illustrationen stammen teilweise aus dem RepDB Free Tier. WODFlow lädt den
offiziellen Datensatz direkt in die lokale IndexedDB und veröffentlicht ihn nicht als eigenes
Dataset oder als API weiter.

**[Exercise data by RepDB (repdb.co)](https://repdb.co)**
