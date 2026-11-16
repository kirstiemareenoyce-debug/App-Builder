# Kairos main-chat backend

This is a focused restoration of the uploaded package's `kairos-query` path.
The other AI tools and connectors are not installed by this setup.

## Boundaries

- The existing mobile app calls `kairos-query` with its signed-in user token.
- Platform JWT verification stays enabled. The handler also verifies the user
  with Supabase Auth before reading history or calling a provider.
- Only the current message and learning/reflection mode reach the model.
  Journals, assessments, partner records, saved history and Work files are not
  model context.
- Separate explicit AI-use and private-history consents are mandatory.
- History uses owner-only read/delete policies; only the server can insert.
  There is no automatic expiry. Account deletion cascades to this history.
- Kimi availability state is service-role-only and contains no API keys,
  prompts, replies, or raw financial balances.
- Provider errors never produce a simulated successful response. If saving
  fails after generation, the error explains that retrying can charge again.

## Provider configuration

All these settings live in **Supabase Edge Function secrets**, not Expo:

| Name | Purpose |
| --- | --- |
| `KIMI_API_KEY` | Kimi developer API credential |
| `OPENAI_API_KEY` | OpenAI developer API credential |
| `AI_PRIMARY_PROVIDER` | `kimi` |
| `KIMI_MODEL` | `kimi-k3` |
| `OPENAI_CHAT_MODEL` | `gpt-5.4-mini` |
| `ALLOWED_ORIGINS` | Exact approved HTTPS browser origins, comma-separated |

The runtime supplies its Supabase URL, public key and service-role key.
Do not override those using mobile credentials.

Kimi uses low reasoning effort and a 2,048-token generation budget, including
reasoning. OpenAI uses a 600-token completion budget and its default no-reasoning
mode. Each provider attempt has a 20-second timeout and no SDK retries. A single
fallback attempt can incur an additional charge. These are per-request limits,
not a daily spending cap.

Kimi's zero-credit condition creates a 15-minute shared cooldown. After a
top-up, an existing cooldown may take up to 15 minutes to expire. Positive
availability is briefly cached. Advisory balance failures do not prove zero
credit, so a bounded generation attempt remains possible. No paid generation
test is part of deployment or verification.

Model and parameter references:
- https://platform.kimi.ai/docs/api/models-overview
- https://platform.kimi.ai/docs/api/chat
- https://developers.openai.com/api/docs/models/gpt-5.4-mini
- https://supabase.com/docs/guides/functions/auth-headers

## Local checks

Requires Deno 2:

```sh
deno task --config supabase/deno.json check
deno task --config supabase/deno.json test
```

Tests use injected, offline provider/auth/database fixtures. They run without
environment or network permissions and cannot spend provider credit.

## Explicit operator actions

`manage.mjs` manages the **external Supabase project**, not Replit's managed
database. It is not a build, startup, workflow, or Publish hook. Each command
requires an explicit project reference matching the mobile app's configured
public Supabase URL. Remote changes additionally require `--apply` and owner
authorization. Never run all historical ZIP migrations against this database.

```sh
node supabase/manage.mjs inspect --project-ref PROJECT_REF
node supabase/manage.mjs bundle --project-ref PROJECT_REF
node supabase/manage.mjs schema --project-ref PROJECT_REF --apply
node supabase/manage.mjs verify-rls --project-ref PROJECT_REF --apply
node supabase/manage.mjs secrets --project-ref PROJECT_REF --origin APPROVED_HTTPS_ORIGIN --apply
node supabase/manage.mjs deploy --project-ref PROJECT_REF --apply
node supabase/manage.mjs verify --project-ref PROJECT_REF --origin APPROVED_HTTPS_ORIGIN
```

Schema installation is additive and deliberately fails if either new table
already exists. Inspect schema drift rather than replacing existing objects.
Privacy checks operate on synthetic rows in the new table inside a transaction
that always rolls back; they neither create accounts nor read real messages.
Live HTTP verification sends only unauthenticated or invalid requests, never a
valid AI prompt. Provider credential values are read from the operator process
and sent directly to Supabase in memory, never stored in files or printed.

Adding the secrets configures backend use only; it does not configure calendar,
mail, research, coaching, or any other advanced service.
