# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

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

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

### Kairos external service boundary

- The imported Kairos mobile app uses the owner's existing Supabase project.
  Do not replace it with the scaffold's Replit database. The generic Drizzle
  commands above do not install or migrate Kairos's hosted Supabase schema.
- `supabase/` contains the focused main-chat backend, operator instructions,
  and offline tests. Read `supabase/README.md` before changing live AI services.
  Other assistants and connectors from the uploaded archive are not enabled.
- Use `deno task --config supabase/deno.json check` and
  `deno task --config supabase/deno.json test` for the Edge Function.
  Automated setup checks must not generate paid AI responses.
- Supabase management commands are explicit owner-authorized operator actions,
  never application startup, build, workflow or Replit Publish hooks.
  Preserve existing data and compare schema before applying additive SQL.
- Provider keys belong in Supabase Edge Function secrets, never mobile source,
  public Expo variables, files, logs or API responses.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
