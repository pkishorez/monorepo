> Names changed since this was written ([ADR 0005](../../../../docs/adr/0005-three-toolkits-three-doors.md)): the doors are now `worker`, `worker/memory`, `worker/alchemy`, `guard`, `server`, `server/cloud`, `client`, `client/web`, `client/expo` and `client/cli`; Cannotation is Middleware; `CurrentAuth` is `Authz.Current`, `VerificationUnavailable` is `Authz.Unavailable`; `authzLayer` is `authz.layer`, `authzCookies` is `authz.cookies`, `resolverLive` is `authz.cloud`, `resolverLocal` is `authz.device`; the `Auth` service is `SignIn`, `authLive` is `cookie` (from `client/web`), `authExpo` is `oauth`, `authLocal` is `signIn.named`, `CliAuth` is `DeviceCode`; a Local Account is a Named Account and a Local Token a Name Token; better-auth's session is a Sign-in, and Session means only the app's.

---

status: superseded by rpc-toolkit ADR-0002
---

# RPC authorization inherits by specificity

Effect RPC authentication and authorization declarations apply to both RPCs and groups. An RPC inherits its group's authorization policy only when it has no policy of its own; the nearest declaration wins rather than implicitly combining policies. Consumers explicitly compose multiple requirements inside their own Effect-returning policy when they need conjunction, alternatives, or another evaluation strategy. This keeps nested declarations predictable and avoids imposing policy combinators on consumers.

Superseded: the rule now lives in rpc-toolkit as Nearest Wins, and auth-toolkit's Auth Cannotation inherits it rather than restating it.
