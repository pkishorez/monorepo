---
'auth-toolkit': patch
---

Add Device Login for First-Party CLIs: a new Effect-only `auth-toolkit/cli` subpath exports `CliAuth`, which runs the browser sign-in, keeps the Session, and attaches it to Effect RPC calls; every Consumer Backend accepts the resulting bearer Session with no opt-in. The OAuth device grant is removed; the device page is now a first-party sign-in served on every deployment.
