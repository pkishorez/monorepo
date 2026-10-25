---
'@kestack/auth-toolkit': patch
'@kestack/web-platform': patch
'@kestack/connect': patch
---

`pnpm dev` signs in with auth-toolkit's Fake everywhere, through the `kestack-fake-auth` export condition, and serves every backend on the site's own origin at `/rpc-<name>`, so one tunnel reaches the whole app; `pnpm dev:real` keeps the Auth Worker. A Fake Account's email must be at `kestack.test`, and `fakeGuard` makes the User from it again. The Web Platform fails any build that carries the Fake, and its `backend` gives a Worker's build the same switch.
