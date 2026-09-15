# WODFlow

Current UI version: **v0.4.1**

WODFlow is a local-first Progressive Web App for composing and running interval workouts.
It is designed to run entirely as a static site on GitHub Pages: no backend, database server,
or Docker host is required.

## Features

- Graphical WOD editor with drag-and-drop block ordering
- Timer blocks
- AMRAP blocks
- Work / Rest rounds
- Advanced EMOM sequences with individual duration, exercises and reps per interval
- Fullscreen workout runner with pause, reset, skip and Wake Lock support
- Workout history including completed and aborted sessions
- Local exercise library in IndexedDB
- Exercise Manager for search, RepDB sync, custom exercise creation and deletion
- App version displayed directly in the UI
- Built-in bodyweight exercise seed library
- RepDB Free sync from the official public dataset; imported exercises remain in IndexedDB
- Exercise images are cached by the service worker after they have been loaded
- Installable PWA with offline app shell
- All WODs and history remain on the device in IndexedDB

## Architecture

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
    |     +-- application shell
    |     `-- viewed exercise images
    |
    `-- optional RepDB Free dataset sync
```

There is no FastAPI or PostgreSQL component in this edition.

## GitHub Pages deployment

The repository already contains `.github/workflows/deploy-pages.yml`.
Every push to `main` builds `frontend/` with Vite and deploys `frontend/dist` to GitHub Pages.

### One-time GitHub setup

1. Create a repository, e.g. `wodflow`.
2. Put the contents of this project in the repository root.
3. Commit and push to `main`.
4. In GitHub open **Settings -> Pages**.
5. Under **Build and deployment -> Source**, select **GitHub Actions**.
6. Open **Actions** and let the `Deploy WODFlow to GitHub Pages` workflow finish.

For a repository named `wodflow`, the site will normally be available at:

```text
https://<github-user>.github.io/wodflow/
```

The Vite build uses relative asset paths, and the PWA manifest/service worker use a relative
scope. Therefore the same build works in a GitHub Pages project subdirectory without hardcoding
the repository name.

## Local development

```bash
cd frontend
npm install
npm run dev
```

Build the production PWA with:

```bash
npm run build
```

Preview the build locally:

```bash
npm run preview
```

## Local data

All user-created content is stored in browser IndexedDB under the database name `wodflow`.
This means:

- no account is required;
- WODs and history are available offline;
- data does not automatically synchronize between devices;
- clearing browser/site data removes the local WODFlow database.

## Exercise library

The first start seeds a small bodyweight library into IndexedDB. The exercise picker can also
import exercise metadata and illustration URLs from the official RepDB Free dataset while online. The application
continues to work if this optional import is unavailable.

## PWA installation

Open the deployed HTTPS GitHub Pages URL in Chrome/Edge on Android or desktop and use the browser's
**Install app** action. GitHub Pages provides the HTTPS context required for service workers and
PWA installation.


## RepDB attribution

Exercise data and illustrations are provided by [RepDB](https://repdb.co) Free Tier.
WODFlow loads the official RepDB dataset from the canonical RepDB repository into the browser's IndexedDB and does not republish the dataset as a standalone dataset or API.

**Exercise data by RepDB (repdb.co)**
