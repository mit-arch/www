# Deployment

This repository includes GitHub Pages deployment plumbing for the Eleventy site.

Assumptions:

- The default branch is `main`.
- The site is built with Node.js and `npm run build`.
- The Eleventy output directory is `dist`.

GitHub repository settings:

1. In `Settings > Pages`, set `Source` to `Deploy from a branch`.
2. Set the branch to `gh-pages` and the folder to `/ (root)`.
3. Keep the workflow trigger on `main` unless you also change `.github/workflows/deploy-github-pages.yml`.

Notes:

- The workflow runs on pushes to `main` and on manual dispatch.
- The workflow publishes the built `dist/` directory to the `gh-pages` branch.
- This branch-based deployment avoids the GitHub Pages provisioning API, which is often blocked for organization repositories.
