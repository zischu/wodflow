# Deploy WODFlow to GitHub Pages

## Repository contents

Upload the complete project folder, including the hidden `.github` directory.

## Initial push

```bash
git init
git add .
git commit -m "Initial WODFlow PWA"
git branch -M main
git remote add origin https://github.com/<USER>/wodflow.git
git push -u origin main
```

## Enable Pages

In the GitHub repository:

1. **Settings**
2. **Pages**
3. **Build and deployment**
4. Set **Source** to **GitHub Actions**

The included workflow builds and deploys automatically on every push to `main`.

## Expected URL

```text
https://<USER>.github.io/wodflow/
```

## Install as PWA

Open the Pages URL in a browser that supports PWA installation and select **Install app**.
After the first successful load, the application shell is available offline.

## Update einer bestehenden Installation

Nach dem Einspielen eines Patches genügt:

```bash
git add .
git commit -m "Fix timer reliability and mobile UX"
git push
gh run watch
```

WODFlow verwendet die Paketversion zur Service-Worker-Invalidierung. Nach erfolgreichem
Deployment die installierte PWA einmal vollständig schließen und erneut öffnen.
