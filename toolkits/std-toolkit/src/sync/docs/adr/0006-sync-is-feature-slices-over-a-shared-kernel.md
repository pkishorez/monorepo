---
status: superseded by ADR-0007
---

# Sync is feature slices over a shared kernel

Sync outgrew its horizontal stack. What began as a read path picked up a write
path (the Outbox) and a peer relay, and the layered folders
(`composition/lifecycle/workers/runtime/persistence/domain`) smeared each
capability across the stack: the Outbox alone lived in five folders
(`domain/outbox-entry`, `persistence/outbox`, `runtime/outbox`,
`workers/outbox-drain`, `composition/offline-action`), `runtime/` had become a
twelve-module catch-all, and `workers/` was a layer with one real inbound edge.
Reading one feature meant walking the whole stack.

We reorganize by capability instead. Two vertical slices — `outbox` and
`collection-sync` (one graph, two doors: keyed and single-item) — each become
a Laymos module graph inside one `features` layer. Below them sits a `kernel`
layer of machinery every slice shares: the Supervisor (the one door all loops
run through, under a Leadership role), Leadership itself, Sync Flow, the
effect runner, the Sync Store, the Registry, the collection model, Peer Sync,
and two ports (`outbox-port`, `platform-port`). Below that, `domain` keeps
only cross-slice vocabulary; each slice owns its private vocabulary
internally. `platform` now points down at the kernel — the `StdSyncPlatform`
port moves into `kernel/platform-port` so the graph has no upward edge.

## The trade-off

We give up the horizontal stack's purity: a slice interior mixes domain,
persistence, runtime, and worker files, and the layer graph no longer sorts
code by architectural kind. In exchange, one capability is one folder, its
graph rules are explicit and non-transitive, and the lifecycle story collapses
to a single sentence: every loop is a worker run by the kernel's Supervisor.

## Deliberate exceptions

- Stored-entity schemas stay central in the kernel's Sync Store — including
  the Outbox Entry schema. Durability, version gating, and wipe remain one
  decision in one place; slice purity loses this one.
- Peer Sync is kernel, not a slice. Both slices consume it from the inside
  (collections build their relay, the Outbox Channel reuses the channel
  opener), and Laymos module graphs cannot reach into each other — shared
  machinery lives below the slices.
- `outbox-entry` stays in `domain`, not inside the outbox slice: every
  collection mutation writes an Entry, so the Entry vocabulary is cross-slice
  by nature. `partition-identity` and `entity-validation` also stay — kernel
  modules use them.
- The slices meet only through kernel ports and the `sync.ts` composition
  root: `kernel/outbox-port` holds the `OutboxRuntime` / `OutboxStore` /
  `FlightHandler` types, the facade passes the Outbox runtime into the
  collection builders, and Outbox narration lives in `kernel/sync-flow`
  beside the read-path narrations.
- The four strategy workers (old-to-new, new-to-old, bidirectional,
  single-item-source) become interior folders of one strategy module of
  `collection-sync` — they are presets, not independent capabilities.
- Merging `sync-execution` with `single-item-lifecycle` (two supervisors
  differing only in shape) is deferred; this ADR moves code, it does not
  redesign supervision.
