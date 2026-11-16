# Everyday Partner Hub

The owner authorized enabling partner features without further setup approvals.
This activates the existing app's account-ID invitations, recipient acceptance
or decline, cancellation/disconnection, and explicit sharing of selected entry
snapshots. It never invites a real account or shares existing entries during setup.
Private archive storage and its existing policies are preserved.

## Privacy contract

- A connection alone grants no access to entries, AI chats, moods, sleep, tasks,
  journals outside this entry store, assessments, or consent records.
- Only the recipient can accept/decline a pending invitation. Neither participant
  can directly change connection status or identities through table updates.
- Reverse pending/accepted duplicates are rejected. A new invitation is possible
  after decline or disconnect; an old invitation cannot be reactivated.
- Private entry owners retain their existing read/write/delete access.
- Sharing requires an accepted participant connection, owner sharing consent,
  and the exact revision timestamp the owner reviewed. Snapshots are copied
  server-side, never built from caller-supplied owner/recipient/content fields.
- Later private edits do not update snapshots. Only deliberate sharing of a newly
  reviewed revision does. Recipients cannot edit or reshare the private source.
- Owners may revoke snapshots without needing an active connection or consent.
  Consent withdrawal/deletion, private entry deletion, disconnect and account
  deletion remove relevant snapshots. Regranting consent never resurrects them.
- Forced row security and minimal grants protect all new tables. Narrow
  fixed-search-path definer functions check the authenticated identity. Neither
  client role nor the AI service receives broad access to private partner data.
- Previously downloaded or external copies cannot be recalled. The app already
  explains that limitation and polls connected/shared records for changes.

The consent table retains the app's scope names, but recording a consent does
not install or activate the associated service. Assessments, AI coaching,
psychological couple maps, notifications, and external account connectors are
**not** activated by this setup. No new paid AI requests or changes to AI
allowances are part of this work.

## Song links and photo memories

The separate partner-memory migration enables private song links (Spotify,
SoundCloud, YouTube Music, other HTTPS links) and explicitly selected phone
photos. It preserves the imported app's external Supabase storage contract
rather than replacing its storage provider.

Photos use a non-public `relationship-memories` bucket with owner-prefixed
paths, a 10 MB limit, and JPEG/PNG/WebP types. Only an owner or the currently
authorized recipient of a consented, accepted-connection snapshot can obtain
new download links. The mobile upload hook sends an ArrayBuffer: native reads
the selected URI with Expo File, while the browser reads its selected Blob.
This avoids React Native Blob incompatibilities in Supabase uploads. Empty and
oversized files are rejected before upload. No storage update policy exists; upload replacement behind
an existing reviewed snapshot is blocked. Sharing also checks that the photo
file exists. Consent withdrawal, revoke, deletion, and disconnect stop new
recipient links. **Already issued photo links can remain valid for up to five
minutes**, matching the existing app's signing lifetime. Downloaded, cached,
or external copies cannot be recalled.

The app uploads the selected original file; this activation does not add
metadata stripping. A photo can therefore contain embedded location/device
metadata. Automatic GPS/EXIF removal is a separate privacy enhancement.
Cloud-library browsing and Spotify/Google Photos/OneDrive account OAuth are
not enabled: music uses pasted links and photos use deliberate device selection.

## Operator commands

These target the owner's existing external Supabase project only and never run
at application startup, build, workflow launch, or Replit Publish.

```sh
node supabase/tests/check-partner-local.mjs
node supabase/partner.mjs inspect --project-ref PROJECT_REF
node supabase/partner.mjs apply --project-ref PROJECT_REF --apply
node supabase/tests/verify-partner-live.mjs --project-ref PROJECT_REF --apply
node supabase/partner.mjs media-inspect --project-ref PROJECT_REF
node supabase/partner.mjs media-apply --project-ref PROJECT_REF --apply
node supabase/tests/verify-partner-memories-live.mjs --project-ref PROJECT_REF --apply
```

Installation fails on pre-existing partner objects rather than replacing unknown
policies or data. Review drift explicitly. The disposable local test installs
the private-entry and partner migrations from scratch, tests account separation
and the full consent/snapshot lifecycle, then rolls back and removes its cluster.

The separately authorized live HTTP check uses three temporary confirmed test
accounts created through the admin API, authenticates normally, and exercises
the same PostgREST table/RPC contract as the app. Account credentials and session
tokens remain in process memory, never files or console output. No email is sent.
It tests synthetic content only, then deletes the temporary accounts; foreign
keys remove their entries, consents, invitations, and snapshots. Review auth
triggers before running it, since external side effects do not roll back.
The media check also uploads only an in-memory synthetic one-pixel PNG, verifies
private/recipient/public access and post-withdrawal signing failures, and deletes
that precise storage path before removing its temporary identities. It never
lists or reads real photos. Local storage tests simulate row-policy enforcement;
the live check exercises the actual Storage API and downloads the test image.
