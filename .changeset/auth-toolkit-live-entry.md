---
'@kstackz/auth-toolkit': patch
---

`authLive` moves to its own entry, `@kstackz/auth-toolkit/clients/auth/live`; `clients/auth` no longer exports it. `clients/auth` is now platform-free (the `Auth` service, `authLocal`, `signedFetch`), so code that only needs those no longer loads better-auth's browser client. Import `authLive` from the new entry.
