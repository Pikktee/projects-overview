# Projekte-Übersicht

Statische Startseite mit Überblick über aktuelle Webprojekte von Henrik Heil.

## Entwicklung

```bash
npm install
npm run build
npm run dev   # http://localhost:3000
```

## Screenshots aktualisieren

```bash
npm run screenshots   # Playwright erfasst alle Projekt-URLs neu
npm run build           # HTML neu generieren
```

Screenshots liegen unter `public/screenshots/` und werden ins Repo committed.

## Deployment

Automatisch via GitHub Actions bei Push auf `main` → Railway (Service `projects-overview`).

Benötigtes Secret im GitHub-Repo: `RAILWAY_TOKEN`

## Projekte pflegen

Neue Projekte in `data/projects.json` eintragen, dann Screenshots und Build ausführen.
