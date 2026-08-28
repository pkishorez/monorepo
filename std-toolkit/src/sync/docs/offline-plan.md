# Offline writes implementation plan

Decisions are recorded in
[ADR 0005](./adr/0005-offline-writes-are-slots-and-named-actions.md). This plan
restates the problem and the solution in simple terms, then breaks the work
into phases.

## The problem

Sync's read side already survives anything: replicas, cursors, and strategy
state are persisted, so a reload rebuilds the collection from disk and resumes.
The write side does not. An optimistic mutation lives only in TanStack DB
memory until `onInsert` / `onUpdate` / `onDelete` confirms against the backend.
If the tab reloads, crashes, or stays offline, the user's edit is silently
lost. The promise an offline-capable sync engine must keep is: **an edit, once
made, survives anything short of the user clearing their browser** — and today
we cannot keep it.

Two write shapes need this promise:

1. **Entity writes** — insert/update/delete on one entity. The overwhelming
   majority of writes.
2. **Actions** — operations whose intent spans entities or must run on the
   server (archive a project, move money). These cannot be reduced to a final
   entity state.

## The solution in simple terms

### Entity writes: a mailbox of destinations, not a diary of trips

While offline (or mid-flight), each entity has **at most one durable slot** in
the Sync Store: the latest state the user wants (`upsert`) or a tombstone
(`delete`). Every new edit overwrites the slot. Insert then three renames then
"done" is one slot; insert then delete is no slot at all. When connectivity
returns, a drain worker sends one request per touched entity, in any order —
there is no operation chain, so one entity's failure never cascades to another.

Slot coalescing rules:

| existing slot            | new edit | result                       |
| ------------------------ | -------- | ---------------------------- |
| none                     | insert   | `upsert` (full state)        |
| `upsert` (unsent insert) | update   | `upsert` (merged state)      |
| `upsert` (unsent insert) | delete   | slot removed — never sent    |
| `upsert` (existing row)  | delete   | `delete`                     |
| `delete`                 | insert   | `upsert`                     |

### Conflicts: the newest *edit* wins, not the newest *arrival*

Every slot carries `proposedU` — a `_u` ULID minted the moment the user edited,
disciplined as a hybrid logical clock (never behind the newest `_u` this client
has seen; server rejects far-future stamps). Entity ids are minted on the
client so offline inserts have stable identity. The backend applies a slot
conditionally: **apply iff `proposedU` is newer than the stored `_u`** (db
`transact` check ops), returning the authoritative entity either way. So a
stale device reconnecting cannot overwrite a newer edit made elsewhere — its
write is *superseded*, a successful no-op that ordinary convergence cleans up.

Three delivery outcomes, no others:

- **applied** — proposal won; confirmed entity converges everywhere.
- **superseded** — backend held something newer; slot dropped; server truth
  repaints via the normal sync path. Silent by default.
- **rejected** — backend invariant said no (thrown as a non-retriable error);
  slot dropped, optimistic state rolls back, app notified.

Transient failures (network, 5xx, timeout) are none of these: the slot stays
and retries on an Effect `Schedule` backoff. Classification is throw-based —
a tagged non-retriable error means rejected; everything else retries.

### Presentation: TanStack's own optimism, no custom overlay

A pending offline write **is** a live TanStack optimistic mutation. The
mutation handler resolves only when the outbox delivers its entry and throws
only on rejection — so TanStack's native rollback undoes rejected optimism,
and `$synced` / `$origin` stay truthful for the whole offline window
(`$synced: false` = genuinely not on the server yet). Consequences:

- **Reload replay is "call the front door again."** On boot, each surviving
  outbox entry re-invokes the same public operation — entity ops replay their
  stored diffs, actions re-invoke by name with their persisted payload —
  flagged via `metadata: { std: { replay: entryId } }` so the wrapper
  re-attaches to the existing entry instead of enqueueing a duplicate.
- **Closures never persist; only data does.** Entity updates store the
  computed changes, not the updater function. Actions must be named and their
  payloads schema-validated (eschema where possible, so queued payloads
  migrate across app versions).
- **Awaiting a write while offline blocks until delivery** (Firestore
  semantics — document loudly). A separate durable acknowledgment answers
  "is it safely queued" for callers who need to navigate away.

### Configuration: offline is orthogonal to pacing

Pacing smooths rapid edits in memory (*when* to send); offline makes intent
durable (*what survives*). Sibling options, any combination:

```typescript
const tasks = std.collection({
  schema: TaskSchema,
  updatePacing: paceStrategy.debounce({ wait: 300 }), // optional, as today
  offline: true, // or { retry, onDiscarded, ... }; instance-level defaults on createStdSync
  onInsert, // unchanged signatures — invoked by the drain instead of directly
  onUpdate,
  onDelete,
});
```

Eager (unpaced) writes still want durability, so nothing is restricted. Note:
pacing currently intercepts only `pacedUpdate`; the offline interception must
cover plain `insert` / `update` / `delete` too.

### Actions: named, partitioned FIFO lanes

```typescript
const archiveProject = std.createOfflineAction({
  name: 'archive-project',            // unique + stable: the routing address
  payload: Schema.Struct({ projectId: Schema.String }),
  onMutate: ({ projectId }) => {      // immediate optimistic application
    projects.update(projectId, (d) => { d.archived = true; });
  },
  mutationFn: ({ projectId }, { idempotencyKey }) =>
    api.archiveProject(projectId, { idempotencyKey }), // runs at drain turn
  partition: ({ projectId }) => projectId, // omit = one default lane
  onPartitionReject: 'halt',          // or 'discard' | 'continue'
});

const handle = archiveProject({ projectId: 'p1' });
await handle.durable;   // safely queued
await handle.done;      // executed on server; rejects → onMutate rolls back
handle.cancel();        // 'cancelled' | 'in-flight' | 'not-found'
```

- Entries addressed by `(namespace, action name, partition key, seq)`.
- Lanes are independent FIFO queues: parallel across lanes, strict order
  within one, created lazily, GC'd when empty, with a lane-count warning.
- Rejection policy per lane: `halt` parks the lane durably (companion API:
  `std.offline.partition(key).pending() / resume() / discardAll()`),
  `discard` drops the remainder and rolls back their optimism, `continue`
  fails only that entry.
- Duplicate action names throw at definition time. Entries whose name no
  longer exists after a deploy are parked and reported via `onUnknownAction`.
- Slots and lanes are independent; same-entity overlap is arbitrated by LWW.
  Flows that need strict ordering live entirely inside one lane.

### Storage, multi-tab, lifecycle

- New stored entities in the **existing Sync Store StdTable** — durability
  (memory / IndexedDB / SQLite) stays the platform's one choice.
- **Any tab enqueues; only the leader drains.** New `OfflineDrain` Leadership
  role: one lock per collection (entity lane), one per active action lane.
  Per-entity serialization is the drainer's in-flight map, not a lock.
- **In-flight is not in the slot**: the drainer claims a slot by clearing it;
  edits during flight write a fresh slot; a landed flight resolves every
  waiter at or below the generation it carried (correct under coalescing).
- Completion is broadcast on the existing peer channel so a non-leader tab's
  pending handler resolves; the store is the truth on boot.
- The **version gate** also wipes outbox records, emitting a
  discarded-count event. **`std.reset()`** wipes replicas, cursors, state,
  and outbox for logout; the documented pattern is a user-scoped Std Sync
  name so cross-user leakage is structurally impossible.
- Status surface: `tasks.utils.outbox.pending() / size() / subscribe() /
  cancel(id)`, `std.offline.size() / subscribe()`, per-row status derived
  from outbox state.

### Prior art

`@tanstack/offline-transactions` (official, TanStack DB monorepo) validates
the architecture and is deliberately mirrored in vocabulary
(non-retriable-error classification, idempotency keys, unknown-handler hook)
and mined for test scenarios. It is not adopted: no cross-transaction
coalescing, one global FIFO (a stuck transaction blocks every entity),
non-leader tabs do not persist offline writes, and it duplicates storage /
election / retry / telemetry that std-toolkit owns in Effect-native form.
See ADR 0005 for the full comparison.

## Implementation phases

Each phase ships and is testable independently.

### Phase 1 — outbox core (isolated, no wiring)

- `persistence/outbox-store/`: stored entities for slots
  (`collection`, entity `key`, `kind`, encoded `value`, `proposedU`,
  `attempts`, `enqueuedAt`), action entries
  (`namespace`, `actionName`, `partitionKey`, `seq`, payload, idempotency
  key, `attempts`), and lane status (`halted`).
- `runtime/outbox/`: `put` (coalescing table), `remove`, `list`, `size`,
  `subscribe`; per-entity generation counter and waiter registry; claim-by-
  clear in-flight discipline; drain loop with Effect `Schedule` retry and
  throw-based rejection classification.
- `proposedU` minting (HLC-disciplined ULID) and client id minting rules in
  `core`/`runtime`.
- Tests against the Memory store: coalescing table, generation waiters,
  outcome handling, claim/re-slot during flight.

### Phase 2 — entity lane wiring

- `composition/keyed-sync/mutations.ts`: behind the collection `offline`
  option, handlers enqueue the slot first, stay pending until delivery,
  throw on rejection; interception covers insert/update/delete and
  `pacedUpdate`.
- Drain worker registered under the `OfflineDrain` Leadership role (one per
  collection); wakes on enqueue, boot, connectivity, retry schedule.
- Browser platform: connectivity signal (`navigator.onLine` + events).
- Boot replay: after collection ready, replay surviving slots as front-door
  operations with the replay flag.
- Flow tracing: outbox lane with enqueue/flight/outcome activities.
- Tests: online behavior identical to today; reload mid-flight loses
  nothing; superseded and rejected paths; multi-tab leader handoff.

### Phase 3 — lifecycle and status

- Version gate wipes outbox records + discarded-count event.
- `std.reset()`; document the user-scoped namespace logout pattern.
- Status APIs: `utils.outbox.*`, instance-level roll-up, per-row status;
  `handle.durable` acknowledgment; cross-tab completion broadcast over the
  peer channel.
- `onDiscarded` / outbox events through the existing `onEvent` surface.

### Phase 4 — offline actions

- `createOfflineAction` module: action registry (duplicate names throw),
  payload schemas, `onMutate` + `mutationFn`, handles
  (`durable` / `done` / `cancel`), partitioned FIFO lanes with lazy workers
  (one Leadership lock per active lane), `onPartitionReject` policies with
  the halted-lane companion API, `onUnknownAction` parking, boot replay by
  name, idempotency keys.
- Tests: lane independence, in-lane ordering, halt/discard/continue,
  rename/unknown-action parking, reload replay of queued actions.

### Phase 5 — server recipe and docs

- Documented backend pattern (with example) for the conditional apply:
  db `transact` check on `_u`, return the authoritative entity on
  supersession; future-bound validation of `proposedU`.
- eschema payload guidance for actions; README/docs updates; sync stories
  covering the full user journeys (fast edits offline → reload → reconnect;
  two-device stale write; halted lane recovery).

## Out of scope (deliberate)

Field-level merge, CRDT collaborative editing, cross-tab visibility of
*unsent* optimistic state, at-rest encryption, and a per-call
`offline: false` escape hatch (revisit only if a real use case demands it).
