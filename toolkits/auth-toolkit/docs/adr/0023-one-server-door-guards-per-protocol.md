# 23. One server door, a guard per protocol, and everything that asks no one in the fake

Date: 2026-10-24

## Status

Accepted. Supersedes the `server/rpc` and `server/http` doors of [ADR 0018](./0018-three-caller-kinds-four-doors.md), and `testAuth`.

## Context

After [ADR 0022](./0022-test-users-at-the-auth-worker-local-mode-becomes-the-fake.md), the server half of the Guard came in three shapes. `auth` was exported from two doors, `server/rpc` and `server/http`, and so was `testAuth`. The fake, meanwhile, was one value with a property per protocol, `fakeGuard.rpc()` and `fakeGuard.http()`. `testAuth` asked no one and admitted Test Users, which is what the fake does, yet it sat on the real doors. And a Principal carried better-auth's `User` and `Session`, so the contract every client imports leaked another library's types, and a Sign-in Principal held its token.

## Decision

- One `server` door: `auth.rpc(options)` and `auth.http(options)`, with `authAs` and `verify`. The protocol is a property, as it is for `fakeGuard`, and the contract was already one value for both ([ADR 0020](./0020-one-guard-for-both-protocols-as-authz.md)).
- `testAuth` becomes `fakeGuard.rpc({ as })` and `fakeGuard.http({ as })`: `as` is the Principal behind every call, or null for nobody. The real doors only ever ask the Auth Worker; everything that asks no one is behind the door named `fake`.
- A Principal's `user` is the toolkit's own `{ id, email, name }`, the same for both kinds, and a Sign-in Principal's `session` is `{ id, expiresAt }`. It never holds the Sign-in token.
- The client's three "could not ask the Auth Worker" errors are one `AuthWorkerUnavailable` with a `kind`: `'unreachable'`, `'server-error'` or `'unreadable'`.
- An Account Switch that a newer one replaces before its turn is never sent; it succeeds, and the newest is shown until it is answered.
- Inside, the part that turns a Resolver into the RPC and HttpApi Layers and admits the caller is its own module, `src/guard-layer`, used by `server` and `fake`; `src/server/verification` is only the real Resolver.

## Considered options

- **Keep `server/rpc` and `server/http`.** Rejected: two doors for one idea, and a third shape beside `fakeGuard`. An RPC server importing `server` still bundles no HttpApi builder, and an HttpApi server no RPC Transport; the tree-shaking test checks both.
- **Make the worker-only dependencies optional peers.** Rejected: the built `worker` door imports them at runtime, so every Auth Worker deployment would have to list them, to save a browser app install size it never bundles.

## Consequences

Every backend reads `auth.rpc` or `auth.http`, and every test `fakeGuard.rpc({ as })` or `fakeGuard.http({ as })`. A Principal built by hand needs only `id`, `email`, `name` and, for a Sign-in, `{ id, expiresAt }`. Code that matched `AuthWorkerUnreachable` or `InvalidAuthWorkerResponse` matches `AuthWorkerUnavailable` and its `kind`.
