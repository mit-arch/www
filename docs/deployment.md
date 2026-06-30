# Deployment

This repository includes GitHub Pages deployment plumbing for a generic Eleventy site.

Assumptions:

- The default branch is `main`.
- The site is built with Node.js and `npm run build`.
- The Eleventy output directory is `dist`.

GitHub repository settings:

1. The workflow is configured to enable GitHub Pages automatically on first run.
2. If your organization restricts that API call, enable Pages manually in `Settings > Pages` and set `Source` to `GitHub Actions`.
3. Keep the deployment branch as `main` unless you also update the workflow trigger.

Notes:

- The workflow runs on pushes to `main` and on manual dispatch.
- If the project uses a different package manager, build command, or output directory, update `.github/workflows/deploy-github-pages.yml` to match the actual site setup.
