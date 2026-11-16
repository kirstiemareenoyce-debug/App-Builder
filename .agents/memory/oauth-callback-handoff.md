---
name: OAuth callback handoff
description: Why OAuth URL cleanup and code-exchange ownership must be coordinated in Kairos.
---

Keep exactly one owner for exchanging each one-use OAuth code. Preserve the original callback until that owner has consumed it; URL cleanup must not invalidate an outstanding handoff.

**Why:** Expo's browser-session completion reads the current browser URL when called, not a previously captured callback. Cleaning the URL first caused Kairos to hand its opener a URL without the PKCE code. Independently exchanging in the callback and opener also risks consuming the same code twice.

**How to apply:** When changing web login or callback handling, verify same-tab versus popup ownership explicitly, keep URL cleanup after consumption, and cover cancellation and duplicate callbacks. Never suppress a missing-code error by accepting an unrelated pre-existing session, and preserve the separate password-recovery verification requirements.
