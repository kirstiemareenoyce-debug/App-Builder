# Kairos

Kairos is a private relationship-wellness application designed to help partners communicate, reflect, and support one another through a shared, secure experience.

The project combines a modern TypeScript application, Supabase services, AI-assisted chat functionality, and partner-sharing workflows. It was developed in Replit and is actively maintained in this repository.

> Kairos is currently under active development. Features and setup details may change as the application evolves.

## Purpose

Kairos helps people navigate communication and relationship wellness in a private, supportive environment. The app is designed around:

- **Private conversations** — preserve and manage private Kairos chat pairs and history.
- **Partner sharing** — allow an owner to share selected experiences or updates with a partner.
- **AI assistance** — provide thoughtful AI-supported guidance through a dedicated backend service.
- **Shared usage controls** — manage approved daily AI request allowances.
- **Private support archives** — retain relevant support information securely within the owner-authorized service boundary.
- **Offline protection** — include test coverage for operations that must remain safe when services are unavailable.

## Key Features

- Owner-scoped chat and history deletion
- Race-safe cache handling
- Partner-sharing functionality
- Private AI daily allowance controls
- UTC-based allowance reset behavior
- Non-blocking AI status refresh
- Private support archive infrastructure
- Supabase-backed main-chat services
- Automated offline Edge Function tests
- OpenAPI-based API code generation

## Technology Stack

- **Language:** TypeScript
- **Package management:** pnpm workspaces
- **Runtime:** Node.js
- **API:** Express 5
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Validation:** Zod and `drizzle-zod`
- **API specification:** OpenAPI
- **API and schema generation:** Orval
- **Backend services:** Supabase Edge Functions
- **Build tooling:** esbuild
- **Development environment:** Replit

## Repository Structure

```text
.agents/       Replit agent configuration and project guidance
artifacts/     Built application packages, including the API server
lib/           Shared libraries and workspace packages
scripts/       Repository automation and maintenance scripts
supabase/      Supabase Edge Functions, configuration, instructions, and tests
package.json   Workspace scripts and dependencies
replit.md      Replit-specific operating and architecture guidance
```

## Getting Started

### Prerequisites

- Node.js 24 or a compatible Node.js release
- pnpm 10.26 or newer
- Access to the required environment variables
- A configured PostgreSQL database or Supabase project

### Install dependencies

```bash
pnpm install
```

### Run the API server

```bash
pnpm --filter @workspace/api-server run dev
```

The API server runs on port `5000` by default.

### Typecheck the project

```bash
pnpm run typecheck
```

### Build the project

```bash
pnpm run build
```

### Regenerate API types and schemas

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Environment Configuration

The generic workspace API requires:

```text
DATABASE_URL=your_postgres_connection_string
```

Kairos's existing mobile application uses a separately managed Supabase project. Provider credentials should be stored as Supabase Edge Function secrets, never in mobile source code, public environment variables, repository files, logs, or API responses.

Consult [`supabase/README.md`](supabase/README.md) before changing live AI or database services.

## Supabase Development

Run a type check for the Supabase configuration:

```bash
deno task --config supabase/deno.json check
```

Run offline tests:

```bash
deno task --config supabase/deno.json test
```

Setup checks must not generate paid AI responses.

## Database Changes

For development database changes managed by the local workspace:

```bash
pnpm --filter @workspace/db run push
```

Do not use generic Drizzle commands to modify Kairos's existing hosted Supabase schema. Supabase schema changes are explicit operator actions and should preserve existing data, compare schemas first, and use additive migrations whenever possible.

## Architecture Notes

- The imported Kairos mobile app connects to its existing Supabase project.
- The workspace API and the hosted Kairos Supabase service are separate service boundaries.
- AI provider keys belong only in secured backend or Edge Function secrets.
- Chat deletion and history operations are owner-scoped.
- Shared AI usage has a private daily allowance that resets according to UTC time.
- Status refreshes should remain non-blocking to the user experience.
- Live Supabase management commands must not run automatically during startup, builds, workflows, or publishing.

## Security and Privacy

Kairos is intended to handle sensitive relationship and support information. Contributions and operational changes should:

- Avoid logging private prompts or user-generated content.
- Never expose provider keys or secrets in source code.
- Respect owner and partner authorization boundaries.
- Preserve existing data during migrations.
- Use least-privilege database and service policies.
- Verify chat-history deletion behavior before deployment.

## Contributing

1. Create a focused branch for the change.
2. Keep changes scoped to a single feature or fix.
3. Add or update offline tests where service behavior is involved.
4. Run type checking and relevant tests before committing.
5. Document important architecture decisions in `replit.md` or an appropriate repository guide.

## License

This project is currently marked for use under the MIT License in `package.json`. Add or review a separate `LICENSE` file if public distribution is planned.

## Repository

[GitHub Repository](https://github.com/kirstiemareenoyce-debug/App-Builder)
