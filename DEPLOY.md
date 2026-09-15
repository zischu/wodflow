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
