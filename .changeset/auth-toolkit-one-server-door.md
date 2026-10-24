---
'@kestack/auth-toolkit': patch
'@kestack/web-platform': patch
'@kestack/ai-toolkit': patch
'@kestack/effect-webrtc': patch
---

auth-toolkit's guards come in one shape: a value per protocol. `server/rpc` and `server/http` are one `server` door: `auth.rpc({ url })` and `auth.http({ url, oauth? })` take the place of each door's `auth()`, and `authAs` and `verify` move there. `testAuth` is gone: `fakeGuard.rpc({ as })` and `fakeGuard.http({ as })` put a fixed Principal (or nobody, `as: null`) behind every call, so everything that asks no one is in `fake`. A Principal no longer carries better-auth's types: `user` is `{ id, email, name }` on every Principal, and a Sign-in Principal's `session` is `{ id, expiresAt }`, so it never holds the Sign-in token. `AuthWorkerUnreachable` and `InvalidAuthWorkerResponse` fold into `AuthWorkerUnavailable`, whose `kind` is `'unreachable'`, `'server-error'` (with `status`) or `'unreadable'`. An Account Switch that a newer one replaces before its turn is never sent. `auth()` and `browser()` no longer name the fake when given `local`, and the unused `@better-auth/mcp` dependency is dropped. Every Layer's type has a name, so the declarations read plainly: `auth.rpc()` and `fakeGuard.rpc()` give a `RpcGuard`, `auth.http()` and `fakeGuard.http()` a `HttpGuard`, and `browser()`, `device()` and `fakeAccounts()` an `AccountsLayer`. Types no caller needs are no longer exported: `Invariant`, `SignInPrincipal` and `TokenPrincipal` from the root, `OAuthOptions` and `HttpOAuthOptions` from `server`, and from `worker` everything but `AuthWorkerConfig` and `AuthWorker`.

web-platform, ai-toolkit and effect-webrtc import the `server` door. ai-toolkit's `serve` refuses any `local` other than exactly `{ local: true }` itself.
