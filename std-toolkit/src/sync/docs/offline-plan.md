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

Every slot carries `proposedU` — a ULID minted the moment the user edited,
disciplined as a hybrid logical clock (never behind the newest update stamp
this client has seen). Entity ids are minted on the client so offline inserts
have stable identity.

**Critical: the proposal never becomes `_u`.** `_u` is also the cursor axis —
strategies fetch "entities beyond cursor X" by `_u` — so writing an old
edit-time stamp into `_u` would land the accepted write *behind* other
clients' cursors, invisible to incremental sync forever. `_u` stays
**server-minted at write time**: every accepted write is ahead of every
cursor, sync visibility never depends on a client clock, and client
convergence keeps comparing `_u` alone — unchanged.

**The conditional apply is user-written, not toolkit-wired.** The backend
author's RPC handler uses the existing db conditional update:

```typescript
taskEntity.getAndUpdate(key, updates, {
  check: (current, meta) => meta._u < proposedU,
});
// check failed → fetch current, return it (superseded)
```

The one db change this requires: **check invariants receive Entity Meta**
(today `EntityInvariant<T> = (current: T) => boolean` sees the value only).
No server-side proposal machinery, no new write paths.

Semantics of comparing edit-time `proposedU` against arrival-time `_u`:
deliberately **conservative**. Arrival is always at or after edit, so a stale
device can never overwrite a newer edit (the safe direction); the cost is
that an offline edit may be superseded by a competing write that merely
*arrived* after it was made. Exact edit-vs-edit fairness — an optional `_p`
edit-stamp meta field compared instead of `_u` — is a documented later
refinement, not v1.

`proposedU` is **optional end to end**: a backend that ignores it does plain
writes — arrival-order LWW, today's behavior, nothing breaks. Adding the one
check clause upgrades to conservative edit-time LWW.

Clock drift is **accounted for, not solved**: sync visibility is immune by
construction (`_u` is server time). Drift affects only conflict fairness
between devices — a behind clock is defended by the HLC floor (never stamps
behind what it has seen, so it cannot lose to itself on an uncontended
entity), an ahead clock is bounded by a server tolerance on `proposedU`
(minutes; beyond it the write is refused as malformed). Within tolerance an
ahead clock wins conflicts unfairly for its skew — documented degradation,
never a correctness failure.

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
  `getAndUpdate` with a meta-aware check (`meta._u < proposedU`), returning
  the authoritative entity on a failed check (supersession); future-bound
  validation of `proposedU`. Prerequisite db change (small, may land in any
  phase): check invariants (`EntityInvariant`, `WriteOptions.check`,
  `getAndCheckOp`) receive Entity Meta alongside the value. The optional
  `_p` edit-stamp refinement is documented but not implemented.
- eschema payload guidance for actions; README/docs updates; sync stories
  covering the full user journeys (fast edits offline → reload → reconnect;
  two-device stale write; halted lane recovery).

## Implementation contracts

Mechanical details a fresh implementer should not have to guess. Where this
section is silent, follow the existing patterns in `../CONTEXT.md`
(vocabulary), `../../persistence/sync-store/sync-store.ts` (stored entity
conventions), the existing workers (drain worker shape), and laymos layering.

### `proposedU` minting (HLC discipline)

Keep a per-Std-Sync `lastSeenStamp` (max of: every `_u` and every `_p`
accepted into any replica, and every `proposedU` this client minted; persist
it in the Sync Store, updating opportunistically). Mint with `ulidx`
monotonic factory seeded at `max(Date.now(), uTime(lastSeenStamp))`;
monotonic mode already breaks same-ms ties. The server-side recipe (phase 5)
refuses a `proposedU` more than a configured tolerance (default: 5 minutes)
ahead of server time as a `rejected` outcome. `proposedU` is never written
into `_u`, which remains server-minted; the v1 recipe compares it against the
stored `_u` in a user-written check (see "Conflicts" above), and the optional
`_p` edit stamp is a later refinement.

### Stored entities (same StdTable as `sync-store.ts`)

Follow the existing pattern (`EntityESchema.make(...)`, `.primary({ pk:
['collection'] })`, opaque encoded payloads via `fromType`):

- `SyncStoredOutboxSlot` — key = entity id; fields: `collection`, `kind`
  (`'upsert' | 'delete'`), `value` (encoded latest entity state; absent for
  delete), `proposedU`, `changes` (encoded partial for replaying updates as
  diffs), `baseKind` (`'insert' | 'existing'` — whether the entity was ever
  confirmed, deciding insert-vs-update replay and the insert+delete
  cancellation), `generation`, `attempts`, `enqueuedAt`.
- `SyncStoredOutboxAction` — key = `seq` (ULID); fields: `collection`
  (namespace), `actionName`, `partitionKey`, `payload` (encoded),
  `idempotencyKey`, `attempts`, `enqueuedAt`.
- `SyncStoredOutboxLane` — key = `actionName + '/' + partitionKey`; fields:
  `collection` (namespace), `status` (`'active' | 'halted'`), `haltedBy`
  (seq of the rejected entry, when halted).

All three are added to the version-gate wipe list in `sync-store.ts`.

### Error classification

Add a tagged error to the sync error domain, e.g. `WriteError.Rejected`
(exported so app handlers can `Effect.fail` it; also accept a defect whose
value is `instanceof` an exported `NonRetriableError` class for non-Effect
API clients). Everything else — typed or defect — is transient and retries.

### Handler / waiter contract

`runMutations` (in `composition/keyed-sync/mutations.ts`), when `offline` is
on: persist/merge the slot, then `await outbox.delivered(entityId,
generation)` instead of calling the user callback. `delivered` resolves when
a flight carrying `>= generation` lands `applied` or `superseded`, and fails
with the rejection when it lands `rejected`. The drain worker is what
actually invokes the user's `onInsert`/`onUpdate`/`onDelete`; their return
value flows to `applyToSyncReplica` exactly as today. `onInsert`'s batch
signature is preserved by the drainer batching ready insert-slots per flight
where convenient; correctness never depends on batching.

### Replay rules (boot)

1. Replica hydration and projection complete first (`Collection ready`).
2. Entity slots replay in `enqueuedAt` order: `baseKind: 'insert'` upserts
   replay as front-door `insert(value)`; existing-entity upserts replay as
   `update(key, d => Object.assign(d, changes))`; deletes as `delete(key)` —
   each with `metadata: { std: { replay: entityId } }`, which routes the
   handler to re-attach (no new slot write, no generation bump).
3. Action entries replay per lane in `seq` order by invoking the registered
   action with the persisted payload and `replay` metadata. A payload that
   fails schema decode, or an unregistered name, parks the entry
   (`onUnknownAction`).
4. Replay happens in every tab (optimism is per-tab); only the leader drains.

### Cross-tab completion

Reuse the peer channel infrastructure with a distinct envelope kind (not a
Peer Message): `{ kind: 'outbox-outcome', entryKey, generation?, outcome }`,
best-effort like Peer Sync — the store is the truth, and every tab's waiter
registry also re-checks the store on reconnect/boot. Confirmed entities
themselves still travel via existing Peer Sync.

### Config types (target surface)

```typescript
type OfflineOption =
  | boolean
  | {
      retry?: Schedule.Schedule<unknown>;      // default: exponential 1s..5m, jittered
      onDiscarded?: (e: OutboxDiscardedEvent) => void;
    };
// createStdSync({ offline?: Omit<OfflineOption, boolean> }) sets instance defaults.
```

Action config and handle types are as sketched in "Actions" above; `done`
resolves with `'applied'`-style outcomes for symmetry
(`'executed' | 'rejected' | 'cancelled'`).

## Out of scope (deliberate)

Field-level merge, CRDT collaborative editing, cross-tab visibility of
*unsent* optimistic state, at-rest encryption, and a per-call
`offline: false` escape hatch (revisit only if a real use case demands it).
