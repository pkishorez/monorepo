---
'@kestack/auth-toolkit': patch
---

Two modes only, real and fake. Breaking: the `kestack-fake-auth` export condition and its doors are gone, so `server`, `client/browser` and `client/device` always give the real ones; an app picks the Sign-in fake from `fake` itself, in fake mode only. `FAKE_MARK` is now `kestack-fake`, the mark every fake carries for the Web Platform's production check.
