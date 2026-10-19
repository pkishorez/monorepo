---
'@kestack/auth-toolkit': patch
---

`@kestack/auth-toolkit/client/browser` exports `localTokenOf(account)`, the Local Token a Local Account signs its calls with. A Local mode app that draws its pages on a server can keep it in a cookie, so the server verifies the visitor with `verify(request, { local: true })` before any call arrives.

`@kestack/auth-toolkit/server/http` exports `verifyRefreshing(request, options)`: `verify`, with the Sign-in cookies the Auth Worker refreshed while verifying, so a server that verifies a plain request, as a page or a socket upgrade, can put them on its response.
