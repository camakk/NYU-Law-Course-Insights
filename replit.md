# NYU Course Insights

Read-only explorer of the uploaded NYU Law evaluations, with professor profiles and course-specific teacher comparisons.

## Run & Operate
- `pnpm --filter @workspace/course-insights run dev` — frontend, via its managed workflow
- `python scripts/extract-evaluations.py` — regenerate the bundled dataset from the supplied workbook using Python's standard library

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

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

- This is a read-only snapshot explorer, so the supplied dataset is bundled with the frontend. No database or authentication is required.
- Default instructor comparisons use the overall professor effectiveness question weighted by offering-level responses. These weights are approximate because per-question response counts are unavailable.
- Preserve distinct offering rows, missing scores, unavailable records and source anomalies; do not silently clean or infer absent data.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
