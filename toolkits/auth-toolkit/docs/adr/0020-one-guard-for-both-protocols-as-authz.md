# 20. One Guard for both protocols, as `Authz`

Date: 2026-10-20

## Status

Accepted. Changes the root door of [ADR 0018](./0018-three-caller-kinds-four-doors.md): `Auth` is renamed `Authz`, and its errors are types too.

## Context

The root door exported one `Auth` object, the same for RPC and HttpApi. Bundling with nothing external (Vite with rolldown) showed both protocols reach every app:

- One module created both the RPC Middleware and the HttpApi Middleware.
- `Auth.required` chooses the protocol at runtime (`isHttp(target)`), so it carries both Middleware.
- `Auth` was a plain object, so a bundler could drop none of its members.
- `browser()` and `device()` sign both protocols' calls.

rpc-toolkit had just split into a door per Transport with named exports ([rpc-toolkit ADR 0005](../../../rpc-toolkit/docs/adr/0005-one-door-per-transport-named-exports.md)), so we tried the same here: a door per protocol (`rpc`, `http-api`), each with `required`, `scope`, `policy` and a `signing` Layer, and `browser()` / `device()` giving a protocol-free `Signer` that each app put under its protocol's `signing`. Measured:

| Entry                               | One Guard | A door per protocol |
| ----------------------------------- | --------- | ------------------- |
| `required` on one Rpc               | 357 kB    | 336 kB              |
| `browser({ url })` with RPC signing | 836 kB    | 806 kB to 826 kB    |

## Decision

One Guard for both protocols, in the root door, as one name: `Authz`. `Authz.required`, `Authz.scope` and `Authz.policy` take an Rpc, RpcGroup, HttpApiEndpoint or HttpApiGroup and choose the Middleware at runtime; `Authz.scope(...)` and `Authz.policy(...)` are also Effects (`yield* Authz.scope('x')` in a handler). `Authz.User` is who called, and `Authz.Unauthenticated`, `Authz.Forbidden`, `Authz.Unavailable` and `Authz.AccountChanged` are what a guarded call fails with. A namespace of the same name declares each class's type, so `Authz.Unauthenticated` names the error as a type as well as a value. `browser()` and `device()` sign both protocols by themselves.

`Authz`, not separate names, so a contract reads as one thing guarding it (`.pipe(Authz.required)`) and its short words, `required`, `scope` and `policy`, never meet an app's own. It is a plain object, so a bundler keeps all of its members; they are a few small values, and the Middleware they carry are the ones every protocol needs anyway.

The split was rejected. It saved about 20 kB on the guard bundle and about 30 kB in the browser, on bundles of 800 kB and more, and it cost a door per protocol, a rename wherever an app uses both, and a footgun: an app that forgot its protocol's `signing` sent every guarded call unsigned, with no type error.

What was kept from it: each Middleware is its own module, created under `/*#__PURE__*/`; `sideEffects: false`; no `export *` in any door; `server/rpc` and `server/http` each import only their own Middleware.

## Consequences

`src/guard/authz/tests/tree-shaking.test.ts` bundles the doors the way consumers import them and holds what stays true: the contract and `browser()` bring neither Effect's `HttpApiBuilder` nor any rpc-toolkit Transport, `server/rpc` brings no `HttpApiBuilder`, and `server/http` no RPC Transport.
