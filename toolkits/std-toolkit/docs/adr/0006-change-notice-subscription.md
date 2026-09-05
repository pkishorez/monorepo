# Add typed subscribe alongside Broadcaster, in-process only

std-toolkit will add a **Change Notice** subscription mechanism, extending Broadcaster's existing publish role into publish+subscribe. Typed `subscribe` calls live where insert/update/delete/restore already live: entity- and value-filtered subscriptions on the **Entity surface** (typed to that entity's schema), and untyped table-wide subscription on **StdTable**. Broadcaster itself stays the shared, untyped, in-process fan-out engine underneath both — it is not exposed as the typed public API, since a single cross-cutting service tag cannot carry per-entity schema typing. `subscribe` returns an Effect `Stream`, filters by exact-match equality on a typed partial value, and fires only as a byproduct of a real committed write (no manual publish). std-toolkit ships a default in-memory implementation (Effect PubSub-backed) so this works without a consumer writing their own fan-out.

Scope is deliberately in-process only for v1, even though cross-process delivery (a subscriber in a different process) was the original motivating idea — no durable transport, no replay of missed notices, no ordering guarantee. The design should allow a transport swap later without changing the typed call sites, but building cross-process delivery now was rejected as premature.

## Considered Options

- **Reuse `sync`'s `PeerChannel`** (multi-tab `BroadcastChannel` fan-out) as the transport — rejected. `sync/CONTEXT.md` already draws a deliberate boundary between Peer Sync (best-effort freshness, not authoritative) and this per-write notification concept; blurring it would undermine that boundary.
- **Put `subscribe` directly on Broadcaster** — rejected. It would be simpler (one place to look) but Broadcaster is an untyped, single global service tag; a typed `entity`/`value` filter needs per-entity schema knowledge that only the Entity surface (or StdTable, for the table-wide case) has.
