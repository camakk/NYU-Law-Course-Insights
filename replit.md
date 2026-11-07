# NYU Course Insights

Explorer for NYU Law course evaluations, with professor profiles, course-specific teacher comparisons, and anonymous post-exam feedback.

## Run & Operate
- `pnpm --filter @workspace/course-insights run dev` — frontend, via its managed workflow
- `python scripts/extract-evaluations.py` — regenerate the bundled dataset from the supplied workbook using Python's standard library

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — creates non-reversible fingerprints for anonymous spam limits and repeat-report prevention; raw IP addresses are not stored.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- The historical dataset is bundled with the frontend; anonymous post-exam feedback uses PostgreSQL. No sign-in is required.
- Default instructor comparisons use the overall professor effectiveness question weighted by offering-level responses. These weights are approximate because per-question response counts are unavailable.
- Preserve distinct offering rows, missing scores, unavailable records and source anomalies; do not silently clean or infer absent data.
- Anonymous post-exam ratings and comments are attached to a specific professor–course pair across terms, not a specific semester or section. Reports from three distinct network fingerprints hide a comment automatically.

## Product

Explore NYU Law course evaluations through professor profiles, course rankings, searchable directories, and a transparent methodology page. Students can anonymously rate exam difficulty and comment on a professor–course pairing across semesters.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
