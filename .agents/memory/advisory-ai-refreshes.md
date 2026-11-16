---
name: Advisory AI refreshes
description: Keep read-only allowance status independent of paid chat completion.
---

Invalidate allowance status immediately after an attempt, but never await its
network refresh as part of completing a send.

**Why:** React Query awaits mutation lifecycle promises. Returning an allowance
refetch promise can leave an already-generated reply undisplayed if the status
read stalls, making the app look unfinished and encouraging a paid retry.

**How to apply:** Advisory reads should run independently, with errors handled
and stale counts shown as unknown. Preserve offline tests with deliberately
unresolved status reads for both successful and failed sends.
