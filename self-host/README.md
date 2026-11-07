# NYU Course Insights — self-hosted edition

This download contains the complete website source, the evaluation dataset, a prebuilt frontend, and a bundled Node.js server that serves both the website and the feedback API at one URL. Replit is not required to run it.

## What is included

- Overview, professor and course directories, detail pages, and methodology.
- All bundled historical evaluation records, including the current name-normalization rules.
- After-the-exam feedback submission, comments, ratings, and reporting.
- PostgreSQL table initialization and the editable source code.
- Prebuilt server and frontend: you do **not** need to install npm packages just to run this release.

## What is not included

- No passwords, session secrets, database credentials, or Replit configuration.
- The current site's anonymous feedback, grades, reports, and visitor fingerprints are **not** exported. A new database starts with no feedback. Historical evaluation data is included.
- HTTPS certificates, domain registration, and a hosting account are not included.
- Fonts may load from Google Fonts; this is not an offline-only edition.

## Quick start

Requirements: **Node.js 22.12 or newer**, a running PostgreSQL database, and a host capable of running a persistent Node.js process.

1. Extract the entire ZIP. Open a terminal in the extracted `nyu-course-insights-self-host` folder.
2. Copy `.env.example` to `.env`.
3. Edit `.env`:
   - Set `DATABASE_URL` to your own PostgreSQL database connection string. Follow your database provider's TLS requirements.
   - Set `SESSION_SECRET` to at least 32 random characters. Generate one on your own computer with:
     ```sh
     node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
     ```
   - Set `PORT` to your host's required port, or leave it as `3000`.
   - Leave `TRUST_PROXY=0` for a direct connection. Set it to the exact number of trusted proxy hops only when your host places the app behind trusted reverse proxies.
4. Initialize a **new, empty database**:
   ```sh
   npm run db:init
   ```
   This creates missing tables; it does not migrate an incompatible existing schema or copy the original site's comments.
5. Start:
   ```sh
   npm start
   ```
6. Visit `http://localhost:3000` (or your configured port).

`npm` is only being used to run the included scripts here; no `npm install` is needed for the prebuilt release. You can also run `node --env-file=.env dist/server/index.mjs` directly.

On hosts that supply environment variables directly, use `node dist/server/index.mjs` instead of `npm start` and provide `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, `PORT`, and `TRUST_PROXY` in the host's environment settings.

## Put it at another URL

Run the Node server on your host and point your domain's DNS at that host. Configure HTTPS using your host or a reverse proxy. Forward **all** paths, including `/api/*`, to this Node server. The website and API must share the same origin.

This release is built for the **root of a domain or subdomain**, for example `https://courses.example.com/`. It is not preconfigured for a subdirectory such as `https://example.com/catalog/`.

The server already handles direct visits and refreshes at `/professors`, `/courses`, `/after-exam`, and detail-page URLs. Do not serve only `index.html` from a static-only host: that would omit the feedback backend.

Example Nginx location for a server listening on port 3000:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

For that single-proxy example, use `TRUST_PROXY=1`. HTTPS configuration is separate.

Health check: `GET /api/healthz`. This confirms the process is running, not that the database is reachable.

## Edit and rebuild

The editable React source is in `artifacts/course-insights/src`. The API is in `artifacts/api-server/src`, and shared code is in `lib`.

Install pnpm 10 (the version used to prepare this release is recorded in `package.json`), then:

```sh
pnpm install
pnpm run build
```

Rebuilding uses the portable Vite configuration in `self-host/vite.config.ts`, without Replit development plugins. Rebuilds overwrite the prebuilt frontend and server, not the database.

The included source dependency manifests are cross-platform. Retain the included `pnpm-lock.yaml` for repeatable future builds; use `pnpm install --frozen-lockfile` when installing exactly those locked versions.

## Operation and backups

- Use one Node process/instance for the current in-memory submission rate limiter. Multiple instances require a shared limiter before they provide equivalent spam protection.
- Back up PostgreSQL regularly. Keep `SESSION_SECRET` stable and private; changing it changes anonymous report fingerprints.
- Never upload `.env` into a public repository or expose PostgreSQL publicly without appropriate access controls.
- No external analytics account or Replit services are required.
- Preserve the dataset's `sourceNotes` and ensure you have the rights to redistribute and publicly host the evaluation content.

## Release verification

The accompanying `VERIFICATION.md` records which checks were actually run on this archive. A host with different database, proxy, or TLS settings still needs those settings configured correctly.
