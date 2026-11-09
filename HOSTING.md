# Publish with GitHub Pages

This is a static, read-only build of the NYU course-evaluations website. The
evaluation records are bundled into the app; it does not need an API server,
database, credentials, or a runtime backend.

## Automatic deployment from this repository

1. Push this project, including `.github/workflows/deploy-pages.yml` and the
   root `CNAME`, to the `camakk/NYU-Law-Course-Insights` GitHub repository.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. In **Settings → Pages → Custom domain**, enter `cameronakker.com` (not the
   `/NYU-Law-Course-Insights` path) and save it.
4. At the domain's DNS provider, point the apex `cameronakker.com` to GitHub
   Pages using the A records below. Remove conflicting apex A, AAAA, or CNAME
   records. GitHub's recommended A records are:

   ```text
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```

   If you use IPv6, add these AAAA records as well:

   ```text
   2606:50c0:8000::153
   2606:50c0:8001::153
   2606:50c0:8002::153
   2606:50c0:8003::153
   ```

   Do not leave the old `192.30.252.153` or `192.30.252.154` apex A records
   in place.

5. Push to `main`, or run **Deploy GitHub Pages** from **Actions**. Wait for
   the workflow to finish successfully. It verifies that the nested app,
   JavaScript, CSS, data, CNAME, and fallback files are present before upload.
6. Confirm `http://cameronakker.com/NYU-Law-Course-Insights/` loads. GitHub may
   take time to provision a certificate after DNS is correct. When **Enforce
   HTTPS** becomes available under **Settings → Pages**, enable it; HTTP will
   then redirect to HTTPS.

This repository is configured for
`http://cameronakker.com/NYU-Law-Course-Insights/`. The workflow builds assets
with that path and puts them in a matching subdirectory of the Pages artifact.
The root `CNAME` contains only `cameronakker.com`; GitHub Pages custom domains
are configured for the domain, not for a path. The root `404.html` lets
professor and course client-side routes load on direct visits and refreshes.

The files do not force HTTP or HTTPS. The site works over HTTP while HTTPS is
unavailable. GitHub Pages provisions HTTPS after the custom domain's DNS is
correct; HTTPS cannot be enabled by adding a certificate to this static build.
The DNS and GitHub Pages settings are external to the source files. A `CNAME`
file alone does not point DNS to GitHub or provision a certificate.

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
root. For manual hosting, copy the contents of this generated folder to the
web root; do not add the outer `nyu-course-insights-github-pages` directory as
another URL level. Domain DNS must point to GitHub Pages separately. Do not
open `index.html` through a `file://` URL.

The build uses the evaluation-data snapshot included in the project. Searches,
filters, sorting, rankings, and detail pages run in the browser without
additional data or API requests. Rebuild and redeploy to publish updated data.
