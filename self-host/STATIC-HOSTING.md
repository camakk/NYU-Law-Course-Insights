# NYU Course Insights — static hosting

This is the complete, prebuilt, read-only website. It needs no Node application,
API server, database, environment variables, credentials, or installation on the
hosting server. An ordinary static web host is sufficient.

## Upload

Upload the contents of this folder (index.html, assets, and the other public
files) to the root of your domain or subdomain. Use HTTP or HTTPS; do not open
index.html directly with a file:// URL.

Configure your host to serve index.html for frontend paths that do not match
an existing file. This allows direct links and refreshes on /professors,
/courses, /methodology, and their detail pages to work.

For example, on Nginx:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

On Apache, enable mod_rewrite and put this in an .htaccess file:

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

For other static hosts, use their single-page-app fallback or rewrite setting:
all unmatched URLs should serve /index.html with status 200.

## Data and browser behavior

All evaluation records and source notes are embedded in the initial JavaScript
download. Searches, sorting, filters, expansions, rankings, and navigation run
in memory in the browser. No data or API requests are needed afterward.
The initial download includes normal static assets; the current design also
loads its fonts from Google Fonts. No live feedback or other database content
is included, and After the exam remains disabled.

The data represents the snapshot at build time. To update it, update the source
evaluation JSON in the project and build again; there is no automatic live sync.
Deploy the entire new build together. Do not mix old HTML and new asset files.
Avoid caching index.html indefinitely; hashed assets can be cached long-term.

## Rebuild from the original project

With the project's dependencies installed, run:

```sh
node self-host/build-static.mjs
```

The upload-ready website is written to
generated-artifacts/nyu-course-insights-static/.
The existing full-server self-host tools are separate and are not required for
this static package.
