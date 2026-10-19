---
'@kestack/auth-toolkit': patch
---

`@kestack/auth-toolkit/client/browser` exports `localTokenOf(account)`, the Local Token a Local Account signs its calls with. A Local mode app that draws its pages on a server can keep it in a cookie, so the server verifies the visitor with `verify(request, { local: true })` before any call arrives.
