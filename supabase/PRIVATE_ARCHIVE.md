# Private Support Archive

The existing mobile Support Profile saves to `aevum_relationship_entries`.
This focused installation enables private save/read/edit/delete only. It does
not install partner connections, shared snapshots, sharing RPCs, assessment
tables, or AI processing. Those missing services can still show separate setup
errors in partner/sharing areas; private archive entries remain usable.

The shared entry table retains the imported app's category contract. All
categories have identical owner-only access; none becomes shared by saving.
Both row-security flags are enabled. Anonymous and service roles receive no
table grants. The existing AI backend has no access path to this content.
Database administrators retain their normal administrative access.

Identity and original creation time cannot be edited; each edit advances its
revision timestamp. Every Support Profile save creates a new private entry.
Deleting one entry leaves other versions intact. Deleting an account cascades
to its entries. No automatic expiry is installed.

## Explicit operator commands

Only run against the owner's configured external Supabase project after
approval. These are not application, build, workflow, or Publish hooks.

```sh
node supabase/private-archive.mjs inspect --project-ref PROJECT_REF
node supabase/private-archive.mjs apply --project-ref PROJECT_REF --apply
node supabase/private-archive.mjs verify --project-ref PROJECT_REF --apply
```

The migration is additive and fails if its objects already exist, rather than
overwriting unknown data or policies. The verification uses an existing account
ID internally, but never reads real entry text or creates accounts. It exercises
synthetic entry save, read, edit, separate versions, and deletion using the
authenticated database role, rejects cross-account access and reassignment,
then rolls back the entire test transaction. No AI requests are made.
