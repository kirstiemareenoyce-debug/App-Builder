---
name: Chat deletion concurrency
description: Why main-chat deletion waits for same-device AI generation instead of cancelling it
---

Wait for an account's in-flight AI request before allowing saved-history deletion on the same running app. Do not treat client-side cancellation as cancellation of the server's eventual save.

**Why:** Provider generation can finish and save after the screen is closed or a network request is aborted. Deleting first can therefore look successful and then leave a newly saved reply behind.

**How to apply:** Preserve the per-owner operation guard across navigation and account-cache clearing. Explain that clear-history deletes saved main-chat exchanges, not a global pause on new messages from other devices or sessions. A stronger cross-device guarantee needs a separately designed server-side ordering mechanism.
