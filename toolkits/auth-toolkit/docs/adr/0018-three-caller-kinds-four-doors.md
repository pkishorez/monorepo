# 18. Three Caller Kinds, four doors

Date: 2026-10-19

## Status

Accepted. Replaces the door list in the monorepo's [ADR 0005](../../../../docs/adr/0005-three-toolkits-three-doors.md) for auth-toolkit. The root's `Auth` object is plain named exports since [ADR 0020](./0020-one-guard-for-both-protocols-as-authz.md). The `local: true` mode is gone since [ADR 0022](./0022-test-users-at-the-auth-worker-local-mode-becomes-the-fake.md): running without the Auth Worker is the `fake` door.

## Context

The toolkit had grown nine doors (`worker`, `worker/memory`, `worker/alchemy`, `guard`, `server`, `server/cloud`, `client`, `client/web`, `client/cli`), two names for one guard (`Authz`, `AuthzHttp`), and three server pieces (`authz.layer`, `authz.cloud`, `authz.cookies`) that every backend wired together by hand. Several things could be done two ways. Nobody could hold the whole of it in their head.

## Decision

Every program that reaches a User's data is one of three Caller Kinds: **Browser** (a same-site web app, holding the Auth Worker's cookie), **Device** (a CLI, TV, desktop or mobile app, holding its own Sign-in token), or **OAuth** (someone else's program, such as an MCP client, holding an Access Token after consent). The doors follow from that:

- `worker`: deploy the Auth Worker; its pages come with it.
- the root: the contract both sides import, `Auth` (`Auth.required`, `Auth.scope`, `Auth.policy`, `Auth.User`), the same for RPC and HttpApi.
- `server/rpc` and `server/http`: one `auth({ url })` value each that verifies, relays refreshed cookies, and applies the guard. `server/http` also takes `oauth`, which is all an MCP server needs, and exports one plain `verify(request)`.
- `client/browser` and `client/device`: a Layer for the one `Accounts` service, so app code is the same for both.

There is no `client/oauth`: other people write OAuth clients. auth-toolkit ships no Kabuki actor; `Accounts` exposes a state stream (Checking, Signed In, Signed Out) and the docs show the gate actor an app writes on top of it. Running without the Auth Worker is a `local: true` mode on the same doors, not a separate service.

## Considered options

- **Folding OAuth into Device.** Rejected: OAuth is the only kind with consent, Scopes and per-resource tokens, and mixing them brought consent-shaped friction back to first-party sign-in (ADR 0010).
- **Shipping an auth actor.** Rejected: every app's gate differs (what it opens, what it remembers), and a state stream makes any actor a thin wrapper.
- **A `server/mcp` door.** Deferred: an MCP server is one HTTP endpoint, so `server/http` with `oauth` covers it until one is actually built.
