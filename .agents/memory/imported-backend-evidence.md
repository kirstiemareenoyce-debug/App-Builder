---
name: Imported backend evidence
description: How to interpret the ZIP's live-validation reports when configuring the existing Supabase project.
---

Treat the uploaded package's claims about successful AI calls, provider funding, and deployed services as historical reports, not verified facts about the connected Supabase project.

**Why:** The archive describes working live AI infrastructure, but a read-only inspection of the user's existing project did not match those deployment claims. Its database is partially initialized rather than a fresh installation.

**How to apply:** Revalidate dependencies against the intended Supabase project before enabling a feature. Compare migrations with the existing schema and preserve current data and access controls; never replay the whole archive's SQL based only on its validation reports. Obtain authorization before changing live services or making paid provider calls.
