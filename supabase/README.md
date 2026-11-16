# Kairos main-chat backend

This is a focused restoration of the uploaded package's `kairos-query` path.
The other AI tools and connectors are not installed by this setup.

Partner connections, consent-based entry sharing, song links and private photo
memories have a separate owner-authorized setup. See `PARTNER_SHARING.md`.
Their content is not added to AI chat context or sent to any AI provider.

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

## Daily main-chat request allowances

The per-account budget migration adds **20 requests per signed-in account per UTC
calendar day**, shared across learning/reflection, devices and Edge workers.
The database, not the phone's clock or timezone, chooses the day. Reset is at
00:00 UTC; no scheduled reset job is required. The constant 20 appears in the
SQL function and table constraint: change both together in a reviewed migration
to adjust it. Do not make this a client-controlled setting.

After authentication, validation, consent and the history dependency check, the
server commits one atomic database reservation **before** entering the provider
runner. The project safeguard migration extends that reservation to the shared
project allowance. A singleton policy row lock serializes reservations and owner
policy changes; both counters update in the same transaction, or neither does.
The UTC day is read after acquiring that lock. Concurrent first requests and
existing counters cannot overshoot either allowance. Each admitted request consumes one slot whether
it succeeds, both providers fail, saving fails, or the client disconnects. A
Kimi attempt and its single OpenAI fallback share that slot (at most two paid
generation attempts). No refunds or automatic generation retries are made.
Malformed, unauthenticated and history-setup failures do not consume slots.
If the reservation response is lost, its slot may still be consumed; the server
fails closed and does not generate or automatically retry the reservation.

Exhaustion returns HTTP 429 with `DAILY_AI_LIMIT_REACHED` and safe reset metadata.
The existing mobile error area explains the UTC reset, keeps the draft, and does
not substitute a reply. Budget outages or a missing migration return a safe 503
before generation. Usage rows hold only account ID, UTC date and attempt count;
clients cannot read, write, reset or invoke the reservation. Deleting chat
history does not reset usage. Account deletion cascades to usage. Daily counters
have no automatic expiry; an owner-reviewed retention job can remove old days
later, never the current UTC day.

**Request limits are not exact dollar caps.** Token usage, prices and provider
fallback affect total spend. A new UTC day can allow another day's full allowance
immediately after the previous day's allowance. This is not a rolling 24-hour
limit or a dollar spending cap. Use provider-side billing
limits/alerts as a separate safeguard; this path does not constrain other AI
tools or prevent account creation abuse.

### Shared project limit and emergency pause

`20261116000300_project_chat_budget.sql` is prepared for owner review only.
It adds an owner-controlled project policy and UTC daily aggregate counters,
and replaces the reservation RPC's result contract. The owner explicitly
approved **100 requests across all accounts per UTC day**. **It installs paused,
with that 100-request allowance configured.** Approval of this policy does not
authorize live schema installation or activation. All accounts
share that allowance; the 20-per-account rule still applies. Denial by either
limit consumes neither counter. Existing per-account counters are summed into
the project counter on upgrade, so known earlier usage is not reset. Usage for
accounts deleted before installation cannot be reconstructed; review provider
usage before first activation or wait for the next UTC day. After installation,
deleting an account or its chat history never refunds aggregate usage.

`PROJECT_AI_LIMIT_REACHED` is a safe HTTP 429 with the UTC reset time, without
revealing project counts. `PROJECT_AI_PAUSED` is a safe HTTP 503 asking the user
to try later; it does not promise a midnight reset. The mobile error area
already displays these safe server messages and keeps the draft. Missing policy,
malformed RPC output, permission errors and timeouts all fail closed with 503;
reservations and emergency checks are never automatically retried.

The handler reserves once for Kimi plus its single OpenAI fallback. The runner
also makes an **uncached database pause check immediately before each paid
attempt**, including OpenAI fallback, and before the Kimi availability probe.
A pause/check failure cannot trigger a paid fallback. A slot reserved just
before a pause may be consumed without generation; there are no refunds.
An owner pause takes effect for subsequent checks, not calls already dispatched
or the small interval between a successful check and transport dispatch. It
cannot cancel or refund provider work already underway. The emergency check does
not block a previously admitted request merely because it took the last slot.
Daily exhaustion resets naturally at midnight UTC, but an emergency pause
persists until the owner explicitly enables AI.

Policy and aggregate tables have forced RLS and no client grants. The service
role can reserve and read the pause, but cannot raise the allowance, unpause,
delete the policy, or reset usage through these functions. Only an authorized
database operator changes the policy. Do not expose management credentials or
these operations in the mobile app. Keep aggregate counters even when deleting
accounts; any later retention work must never remove the current UTC day.

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
node supabase/tests/check-budget-local.mjs
node supabase/tests/check-history-local.mjs
pnpm --filter @workspace/scripts exec tsx --test ../artifacts/mobile/lib/kairos-ai-history.test.ts
```

The history SQL runner checks individual-pair deletion, clearing more than the
50 displayed exchanges, idempotency, and cross-owner isolation using only
synthetic accounts in a disposable local database. It installs no live changes.

## Deleting saved main-chat history

Each saved reply offers **Delete message and reply**; **Clear saved main-chat
history** deletes all of that owner's main-chat exchanges, not just the latest
50 displayed. Both require confirmation. Neither changes drafts, other
assistants, journals, questionnaires, Work/partner records, or daily usage.
Deletion has no automatic retries and failures are explicit, including an
ambiguous network result that may have committed. Retry is safe if a row was
already deleted. A refresh error is shown separately from a successful delete.

On the same running app, sending and deleting are mutually exclusive per owner,
including across navigation and account switches. A running request must finish
before deleting because cancelling a client request cannot guarantee that the
server will not save its reply. Queries are cancelled around deletion and both
cached rows and local completed turns are removed. No deleted rows are reinserted
by the client. This is not a global generation pause: another device or a newly
started session can save new exchanges after clear. Confirmation explains this.

Tests use injected, offline provider/auth/database fixtures. They run without
environment or network permissions and cannot spend provider credit.
The SQL runner requires PostgreSQL 16 binaries (`initdb`, `pg_ctl`, `psql`).
It starts a disposable local cluster without a TCP listener and checks allowance
exhaustion, UTC reset, user isolation, grants and account deletion. Schema,
synthetic accounts and counters are all rolled back; no live credentials are read.
The project tests additionally install fixtures committed only inside that
disposable cluster, run 120 independent reservations across concurrent processes,
and verify first-use/existing-row exhaustion, atomic counter agreement, a paused
burst, upgrade seeding, UTC rollover, owner-only controls and deletion isolation.
The entire cluster is removed afterward. No provider transport or live database
is used.

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
node supabase/manage.mjs budget-schema --project-ref PROJECT_REF --apply
node supabase/manage.mjs project-budget-schema --project-ref PROJECT_REF --apply
node supabase/manage.mjs ai-pause --project-ref PROJECT_REF --apply
# Only after approval of this specific allowance and activation:
node supabase/manage.mjs ai-enable --project-ref PROJECT_REF --daily-limit 100 --apply
node supabase/manage.mjs verify-budget --project-ref PROJECT_REF --apply
node supabase/manage.mjs verify-rls --project-ref PROJECT_REF --apply
node supabase/manage.mjs secrets --project-ref PROJECT_REF --origin APPROVED_HTTPS_ORIGIN --apply
node supabase/manage.mjs deploy --project-ref PROJECT_REF --apply
node supabase/manage.mjs verify --project-ref PROJECT_REF --origin APPROVED_HTTPS_ORIGIN
```

Schema installation is additive and deliberately fails if either new table
already exists. Inspect schema drift rather than replacing existing objects.
The original `schema` action does not install the new budget schema. Before
running `budget-schema`, obtain explicit owner approval for
`migrations/20261116000200_main_chat_budget.sql` and the 20-request policy.
No live approval or installation is implied by preparing these files.
For the project safeguard, separately obtain owner approval of the new migration
and desired allowance. Inspect existing budget functions, tables, grants and
auth triggers for drift. Install the per-account migration first if absent,
then `project-budget-schema` (which starts paused), and deploy the matching handler
only with owner authorization. Run the offline checks before installation; do
not replay the old live `verify-budget` command against the new contract (it
tests the legacy per-user-only schema). Do not use the disposable-only project
test SQL against a live database. Check the paused function with invalid or
unauthenticated traffic only; do not send a paid prompt for verification.
After explicit activation approval, use `ai-enable` with the approved limit.
Use `ai-pause` for an emergency; it leaves all counters intact. Re-enabling or
adjusting the limit never refunds slots; lowering it below usage blocks further
reservations. Never revert to the old per-user-only function to recover service.
No remote schema, policy, secrets or deployment command is part of build/startup.
After approval, inspect existing objects, install the additive budget migration,
run rollback-only `verify-budget`, then separately approve deployment of the
updated function and mobile app. Never deploy the new handler before the budget
schema is ready: it deliberately blocks generation when the RPC is missing.
The live SQL check creates synthetic auth IDs in its transaction; inspect any
existing auth triggers first, because external trigger side effects might not
roll back. Prefer the disposable local runner when those triggers are unknown.
If recovery is needed after activation, keep the budget gate in place and
temporarily stop chat rather than restoring an unbudgeted paid path. Inspect
the issue before changing counters; do not delete or replay today's usage.
Privacy checks operate on synthetic rows in the new table inside a transaction
that always rolls back; they neither create accounts nor read real messages.
Live HTTP verification sends only unauthenticated or invalid requests, never a
valid AI prompt. Provider credential values are read from the operator process
and sent directly to Supabase in memory, never stored in files or printed.

Adding the secrets configures backend use only; it does not configure calendar,
mail, research, coaching, or any other advanced service.
