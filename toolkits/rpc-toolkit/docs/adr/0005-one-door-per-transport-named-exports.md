# 5. One door per Transport, and plain named exports

Date: 2026-10-20

## Status

Accepted. Changes the door list of the monorepo's [ADR 0005](../../../../docs/adr/0005-three-toolkits-three-doors.md) for rpc-toolkit.

## Context

The `rpc` door exported one `Rpc` namespace (`export * as Rpc`), holding `middleware`, `onExit` and the three Transports as nested namespaces (`Rpc.http`, `Rpc.websocket`, `Rpc.inProcess`), with the Stream Stores one level further down (`Rpc.websocket.streams.sqlite`). The `http-api` door was an `HttpApi` namespace of one value.

A bundle with nothing external, through Vite and rolldown, showed the namespaces were not costing size: an entry using only `Rpc.http.client` carried none of the websocket Transport, the in-process Transport or the http server. They cost clarity. What a door offers could only be read by walking namespaces, and one name (`Rpc`) meant both this toolkit's namespace and Effect's `Rpc`. auth-toolkit made the same move from one object to named exports ([auth-toolkit ADR 0020](../../../auth-toolkit/docs/adr/0020-one-guard-for-both-protocols-as-authz.md)).

## Decision

Each Transport is its own door: `rpc/http`, `rpc/websocket`, `rpc/in-process`. The `rpc` door keeps what every Transport shares, `middleware` and `onExit`. The `http-api` door exports `middleware`. Every door's `index.ts` is explicit named re-exports, values and types: no `export *`, no `export * as`, no namespace objects. Names are short within their door, the way Effect splits `effect/rpc` and `effect/http`; an app that meets two of them renames one at import (`import { client as httpClient } from '@kestack/rpc-toolkit/rpc/http'`).

The nested Stream Stores became `attachmentStreamStore` and `sqliteStreamStore` on `rpc/websocket`. `connection` is the `RpcConnection` class under that name, so `connection['Service']` still names its type.

Top-level calls that create values (`Context.Reference`, `Layer.effect`, `Stream.unwrap`, `Schema.Class`, ...) carry `/*#__PURE__*/`, and `sideEffects: false` stays, so an unused one drops even from a module that is kept.

## Considered options

- **Keep the namespaces.** They tree-shook, but the API surface was only discoverable by walking them.
- **Flat names on one door** (`httpClient`, `websocketClient`, ...). Rejected: long names everywhere to avoid a rename that only the rare app using two Transports needs, and one door would still name every Transport.

## Consequences

Measured with nothing external (Vite with rolldown), before and after:

| Entry                    | Before                                               | After            |
| ------------------------ | ---------------------------------------------------- | ---------------- |
| `rpc/http` `client` only | 530 kB, no websocket, in-process or http server code | 530 kB, the same |

`src/integration-tests/tree-shaking.test.ts` bundles each door's entry the way consumers import it and asserts which modules are absent, so a Transport that starts leaking into another fails a test. Every consumer's imports changed; there is no compatibility alias, as the package is still `0.x`.
