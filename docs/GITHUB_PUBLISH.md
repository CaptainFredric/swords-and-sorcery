# GitHub Publication

The intended public repository is `CaptainFredric/swords-and-sorcery`.

## Fastest path

1. On GitHub, create a new repository named `swords-and-sorcery`.
2. Set visibility to **Public**.
3. Initialize it with a README so the `main` branch exists.
4. Do not add a license yet; the project has not selected one.
5. Return to ChatGPT and say the repository exists. The connected GitHub tool can then populate/update files in the repository.

## Manual fallback

If you want to publish the supplied snapshot yourself, unzip it into a clean folder and run:

```bash
git init
git add .
git commit -m "feat: publish Swords & Sorcery pre-alpha"
git branch -M main
git remote add origin https://github.com/CaptainFredric/swords-and-sorcery.git
git push -u origin main
```

If the GitHub repository was initialized with a README and therefore already has a commit, either let ChatGPT populate it through the GitHub connector or clone the repository first and copy the project files into that clone before committing. Do not force-push merely to avoid reconciling the initial README commit.

## After publication

Run GitHub Actions and confirm `npm run verify` passes before treating `main` as a deployable baseline. Then connect the repository to a persistent-WebSocket Node host (the included `render.yaml` is one starting point).
