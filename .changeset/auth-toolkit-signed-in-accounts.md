---
'@kstackz/auth-toolkit': minor
---

The browser client gains `signedInAccounts()`, which lists every Signed-in Account of the browser with its Session token and the Active Account marked, and `switchAccount(token)`, which makes one the Active Account for every tab. A First-Party app may send a listed token as `Authorization: Bearer` to its own Consumer Backend to act as that account whichever is active; Server-Side Verification already resolves a bearer before the cookie. See ADR 0014.
