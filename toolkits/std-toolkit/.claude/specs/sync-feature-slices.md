# Spec: sync-feature-slices

Source: `this conversation`

## Problem

Sync outgrew its horizontal stack. The package now carries a read path
(partitioned and single-item collection sync), a write path (the Outbox with
its Drainer, Flights, Waiters, and Offline Actions), and a peer relay — but
the folder structure still sorts code by architectural kind
(`composition/lifecycle/workers/runtime/persistence/domain`). One capability is
smeared across the stack: the Outbox lives in five folders, `runtime/` holds
twelve modules that everything imports, `workers/` is a layer with a single
real inbound edge, and `domain/` has six near-empty modules. Reading one
feature means walking every layer; the lifecycle of the loops is hard to see.

## Outcome

`src/sync` reads as three vertical feature slices over a shared kernel. Each
slice is one Laymos module graph in one folder; every long-running loop is a
worker run through the kernel's single Supervisor door; the layer graph is
strictly downward with no upward edge; `laymos lint` passes; all existing
tests pass unchanged in behavior. ADR 0006 records the decision; CONTEXT.md
defines Supervisor.

## Requirements

1. Three feature slices, each a Laymos module graph in a `features` layer:
   `outbox`, `collection-sync` (one graph, two exposed doors: keyed and
   single-item), `peer`.
2. A `kernel` layer holds everything two or more slices (or the facade) share:
   Supervisor, Leadership, Sync Flow, effect runner, Sync Store, Registry,
   collection model, and the reusable channel opener.
3. `strategy-lifecycle` is renamed `supervisor`; it remains the only door any
   loop runs through (roles: Strategy, CadenceRepair, OutboxDrain).
4. `domain` keeps only cross-slice vocabulary; each slice owns its private
   vocabulary inside its graph.
5. Stored-entity schemas stay central in the kernel's Sync Store, including
   the Outbox Entry schema (accepted purity leak; durability, version gating,
   and wipe remain one decision).
6. `StdSyncPlatform` and `Connectivity` port types move out of `sync.ts` into
   `domain`, so `platform` points down at `kernel` and the layer graph has no
   upward edge. The facade re-exports the types.
7. The four strategy workers (old-to-new, new-to-old, bidirectional,
   single-item-source) become files inside one strategy module of
   `collection-sync` — presets, not modules.
8. Behavior-preserving: no public API change, no supervision redesign, no
   change to any runtime semantics. `mutation-pacing` stays (still live on the
   non-outbox path) and moves into `collection-sync`.
9. `laymos.config.json` is rewritten to express the new layers and the three
   module graphs; new `__tests__` directories are added to `ignoredPaths`
   (today `workers/outbox-drain/__tests__` and `domain/outbox-entry/__tests__`
   are missing from it).
10. `docs/offline-plan.md`'s "Where each piece lives" table is refreshed to
    the new layout and its drifted OutboxStore API description corrected to
    the shipped `enqueue/byId/list/lane/setStatus/remove/resetInFlight`.

## Modules and Layers

Target layer graph (all edges downward, transitive within the layer graph):

```
sync.public   → sync.features, memory.public
sync.features → sync.kernel
sync.kernel   → sync.domain, db.public
sync.domain   → core.public
sync.platform → sync.kernel, idb.public
```

Target tree:

```
src/sync/
  sync.ts  index.ts  CONTEXT.md  README.md  docs/  __tests__/
  features/
    outbox/            module graph "outbox"
      outbox/            exposed facade: wires runtime + drain + actions + replay
      entry/             Entry shape, laneOf, foldLane, Flight vocabulary
      store/             OutboxStore over the kernel Sync Store schema
      runtime/           signal queue, Flight Registry, Waiters, Outbox Channel
      drain/             runOutboxDrain worker
      offline-action/    makeOfflineActions, replayAll
    collection-sync/   module graph "collection-sync"
      keyed-sync/        exposed door (buildPartitioned + mutations)
      single-item-sync/  exposed door (buildSingleItem + mutations)
      execution/         sync-execution + partition-sync ref-counting
      single-item-lifecycle/
      strategy/          strategy-runtime types + the four worker presets as files
      cadence-repair/
      source/            sync-source
      replica/           sync-replica
      state/             sync-state
      pacing/            mutation-pacing
      projection/        collection-projection
    peer/              module graph "peer"
      peer-sync/         exposed door
      message/           peer-message
  kernel/
    supervisor/          renamed strategy-lifecycle
    leadership/          + in-memory (keeps its existing module graph)
    sync-flow/  effect-runner/  sync-store/  sync-registry/
    collection-model/  open-channel/
  domain/
    sync-event/  sync-address/  sync-error/  peer-channel/  platform/
  platform/
    browser/  web-locks/
```

### sync.public (`sync.ts`)

**Responsibility.** The composition root: `createStdSync` builds one Std Sync
and owns the Drainer scope, Ready Gate, and reset/dispose.

**Change.** Import only slice facades and kernel doors. Move `StdSyncPlatform`
and `Connectivity` type definitions to `domain` and re-export them. Inject
cross-slice needs at construction: the collection builders receive the outbox
handle (flight registration + replay) and the peer factory as parameters
instead of importing those slices — module-graph members may not import
another graph's members, so the facade is where slices meet.

**Public behavior.** Unchanged — same exports, same options, same semantics.

**Layers.**

- **sync.public:** rewiring of imports and injection; type re-exports.

**Dependencies.** `features` (three graph facades/doors), `kernel`,
`memory.public`.

**Testing.** The full existing suite (`src/sync/__tests__`) passes unchanged.

### outbox (feature slice, module graph)

**Responsibility.** The durable write path: every write is an Entry, the
leader's Drainer folds and flies lanes, Waiters resolve callers.

**Change.** Gather `domain/outbox-entry`, `persistence/outbox`,
`runtime/outbox`, `workers/outbox-drain`, `composition/offline-action` into
one graph. Add an exposed facade member that composes runtime + drain worker +
offline actions + replay into the single capability `sync.ts` consumes; the
other members go private. Graph rules (non-transitive, each edge declared):
facade → runtime, drain, offline-action, entry; runtime → store, entry;
drain → runtime, entry; offline-action → runtime, entry; store → entry.

**Public behavior.** Unchanged: `outbox: true` semantics, Entry lifecycle,
no-retry policy, coalescing in the Drainer per ADR 0005.

**Layers.**

- **sync.features:** new `features/outbox` graph; five folders deleted at
  their old paths.

**Dependencies.** Kernel: sync-store (schema + persistence), supervisor (the
drain runs under the OutboxDrain role — supervision itself stays in
`sync.ts`'s drain scope as today), sync-flow, open-channel; domain:
peer-channel port, sync-event.

**Testing.** Existing outbox tests (`src/sync/__tests__/outbox.test.ts`,
entry fold tests) pass; fold tests move with `entry/`.

### collection-sync (feature slice, module graph)

**Responsibility.** How a collection syncs: keyed/partitioned and single-item
assembly, per-partition execution, strategy presets, cadence repair, replica,
state, pacing, projection.

**Change.** Gather `composition/keyed-sync`, `composition/single-item-sync`,
`lifecycle/sync-execution`, `lifecycle/partition-sync`,
`lifecycle/single-item-lifecycle`, `workers/{old-to-new,new-to-old,
bidirectional,single-item-source}`, `workers/cadence-repair`,
`runtime/{sync-source,strategy-runtime,mutation-pacing,collection-projection}`,
`persistence/{sync-replica,sync-state}` into one graph with two exposed doors
(`keyed-sync`, `single-item-sync`). The four strategy workers and
`strategy-runtime` collapse into one `strategy` member as files. Private
slice vocabulary (`strategy-state`, `partition-identity`, `entity-validation`,
`cadence-policy`, `entity-convergence`, `slice-coverage`, `tuning`) folds into
the members that own it.

**Public behavior.** Unchanged collection/singleItemCollection behavior.

**Layers.**

- **sync.features:** new `features/collection-sync` graph; old folders
  removed.
- **sync.domain:** seven small vocabulary modules deleted (absorbed).

**Dependencies.** Kernel: supervisor, leadership, sync-store, sync-flow,
sync-registry, collection-model, effect-runner. Injected by the facade:
outbox handle, peer factory.

**Testing.** Keyed/single-item composition tests, flow-tracing, leadership,
partition lifecycle, batch-mutation tests pass unchanged.

### peer (feature slice, module graph)

**Responsibility.** Tab-to-tab entity relay: Peer Channel per collection,
serialized apply chain, Peer Messages.

**Change.** `runtime/peer-sync` splits into graph members `peer-sync`
(exposed) and `message`; `open-channel.ts` moves to the kernel (shared with
the Outbox Channel); the `PeerChannel` port stays in `domain/peer-channel`.

**Public behavior.** Unchanged.

**Layers.**

- **sync.features:** new `features/peer` graph.
- **sync.kernel:** gains `open-channel`.

**Dependencies.** Kernel: open-channel, sync-flow; domain: peer-channel,
sync-event.

**Testing.** Peer-integration tests pass unchanged.

### kernel

**Responsibility.** Machinery every slice shares; the stable bottom of the
package.

**Change.** New `kernel/` folder gathers `lifecycle/strategy-lifecycle`
(renamed `supervisor`), `runtime/{leadership,sync-flow,effect-runner,
sync-registry,collection-model}`, `persistence/sync-store`, and the extracted
`open-channel`. The `leadership` module graph (`index` + `in-memory` seeing
`leadership.ts`) carries over. Sync Store keeps all stored-entity schemas.

**Public behavior.** Same doors, new paths; `supervisor` is a rename only.

**Layers.**

- **sync.kernel:** new layer; modules exposed as today, `shared` flags drop
  where layer position now grants access.

**Dependencies.** `sync.domain`, `db.public`.

**Testing.** Leadership and persistence tests pass unchanged.

### domain

**Responsibility.** Cross-slice vocabulary only.

**Change.** Shrinks to `sync-event`, `sync-address`, `sync-error`,
`peer-channel`, plus a new `platform` module holding the `StdSyncPlatform`
and `Connectivity` port types moved down from `sync.ts` and
`domain/outbox-entry`.

**Public behavior.** Types unchanged; import sites updated.

**Layers.**

- **sync.domain:** module list shrinks from twelve to five.

**Dependencies.** `core.public` only.

**Testing.** Type-level; covered transitively by the suite.

### platform

**Responsibility.** Environment presets: IDB store, Web Locks leadership,
BroadcastChannel, connectivity.

**Change.** Imports `StdSyncPlatform`/`Connectivity` from `domain` (via
kernel-reachable path) instead of `sync.ts`; laymos rule becomes
`sync.platform → sync.kernel, idb.public`. No behavior change.

**Public behavior.** Unchanged `browser()` preset.

**Layers.**

- **sync.platform:** import-direction fix only.

**Dependencies.** `sync.kernel`, `idb.public`.

**Testing.** Existing platform-dependent tests pass unchanged.

### laymos.config.json

**Responsibility.** Source of architectural truth.

**Change.** Rewrite the `sync` layer graph to the five-layer target; declare
the three module graphs with the rules above; keep the `leadership` module
graph; register every moved module; add all `__tests__` directories (including
the currently missing `workers/outbox-drain/__tests__` and
`domain/outbox-entry/__tests__` at their new locations) to `ignoredPaths`.

**Public behavior.** `pnpm lint:laymos` exits 0.

**Layers.**

- **config:** full rewrite of the sync section.

**Dependencies.** All modules above.

**Testing.** `laymos lint` clean; `laymos inspect project` shows the intended
shape.

## Cross-Module Flow

`createStdSync` (public) builds kernel services (effect runner, Sync Store,
Leadership, Sync Flow), then the outbox facade when `outbox: true`, then hands
collection builders their kernel doors plus the injected outbox handle and
peer factory. Every loop — a strategy session, cadence repair, the Drainer —
is a worker effect passed to the kernel Supervisor under a Leadership role;
`sync.ts` owns the Drainer scope, `execution` owns per-partition scopes,
`single-item-lifecycle` owns the singleton scope; workers own nothing.
Slices never import each other; they meet only in the facade.

## Implementation Decisions

- Feature slices as Laymos module graphs, one `features` layer, one graph per
  slice; graphs are disjoint and non-transitive, so cross-slice needs are
  injected at the `sync.ts` composition root.
- `collection-sync` is one graph with two exposed doors (keyed, single-item)
  — they hide the same decision.
- Tiny domain modules fold into their owning slice; `domain` keeps only
  cross-slice words.
- Schemas stay central in the kernel Sync Store (ADR 0006 exception).
- Strategy workers become files in one `strategy` member.
- Port types move down to kill the `platform → public` edge.
- Layer names: `public`, `features`, `kernel`, `domain`, `platform`.
- Supervisor added to CONTEXT.md; ADR 0006 records the shape.
- Execute only after `feat/offline-mutations` lands on main.

## Out of Scope

- Merging `sync-execution` and `single-item-lifecycle` into one supervisor
  shape (noted follow-up, not this change).
- Any behavior, public API, or semantics change; no removal of
  `mutation-pacing`.
- Restructuring anything outside `src/sync`.
- Landing this work inside the `feat/offline-mutations` branch.

## As built (2026-08-31)

Implemented on `feat/offline-mutations` at the user's request (ahead of the
originally planned post-merge sequencing). Deviations forced by the code:

- `peer` is a kernel module (`kernel/peer-sync`, with `open-channel` and the
  message codec as interior files), not a feature slice — both slices consume
  it and module graphs cannot import each other.
- `outbox-entry`, `partition-identity`, and `entity-validation` stay in
  `domain` — collection mutations use the Entry vocabulary directly, and
  kernel modules (`sync-flow`, `sync-registry`) use the other two.
- New `kernel/outbox-port` (`OutboxRuntime`, `OutboxStore`, `FlightHandler`,
  `OutboxOutcome` types) and `kernel/platform-port` (`StdSyncPlatform`);
  `Connectivity` stays in `domain/outbox-entry`.
- Outbox narrations (`narrateOutbox`, `narrateFlight`, `flightOutcome`) moved
  into `kernel/sync-flow`; `makeOutboxReplay` became the `outbox-replay`
  member of `collection-sync`.
- The `leadership` module graph dissolved into a plain shared kernel module
  with `in-memory` as interior.
- `features/outbox/outbox` is the graph's exposed facade: `makeOutbox` wires
  store → runtime → offline actions → drain; `sync.ts` keeps the Drainer
  scope, Ready Gate, and supervision.
- `package.json` exports and `tsconfig.json` paths updated
  (`./sync/paced`, `./sync/leadership/in-memory`).

Verified: `vp check`, `tsc` (0 errors), `laymos lint` (no violations, 2
module graphs), vitest `src/sync` 152/152.
