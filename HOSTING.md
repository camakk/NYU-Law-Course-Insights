# Publish with GitHub Pages

This is a static, read-only build of the NYU course-evaluations website. The
evaluation records are bundled into the app; it does not need an API server,
database, credentials, or a runtime backend.

## Automatic deployment from this repository

1. Push this project to GitHub.
2. In the repository, open **Settings → Pages** and set the source to **GitHub Actions**.
3. Push to the `main` branch, or run **Deploy GitHub Pages** from the **Actions** tab.

This repository is configured for
`http://cameronakker.com/NYU-Law-Course-Insights/`. The workflow builds assets
with that path and places them in the matching subdirectory of the Pages
artifact, so the site is served at the requested URL even though the custom
domain is attached at its root. The root `CNAME` file configures
`cameronakker.com`; the root `404.html` preserves professor and course detail
routes on direct visits and refreshes.

## Build the static files locally

From the project root, run:

```sh
pnpm install --frozen-lockfile
GITHUB_PAGES_BASE_PATH=/NYU-Law-Course-Insights/ \
GITHUB_PAGES_NEST_OUTPUT=true \
node self-host/build-github-pages.mjs
```

The deployable folder is written to
`generated-artifacts/nyu-course-insights-github-pages/`.
The generated folder contains the site under
`NYU-Law-Course-Insights/`, plus `CNAME`, `.nojekyll`, and `404.html` at its
root. Upload its contents to GitHub Pages. Domain DNS must point to GitHub
Pages separately. Do not open `index.html` through a `file://` URL.

The build uses the evaluation-data snapshot included in the project. Searches,
filters, sorting, rankings, and detail pages run in the browser without
additional data or API requests. Rebuild and redeploy to publish updated data.
