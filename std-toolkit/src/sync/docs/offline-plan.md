# Outbox implementation plan

Decisions are recorded in
[ADR 0005](./adr/0005-offline-writes-are-an-outbox-drained-by-the-leader.md);
the layer layout below follows [ADR 0007](./adr/0007-sync-layers-are-the-story-zoom-levels.md).
This plan restates the model in simple terms, places every piece in the
laymos layer stack, breaks the work into phases, and pins the mechanical
contracts. Vocabulary is in [CONTEXT.md](../CONTEXT.md).

## The problem

Sync's read side already survives anything: replicas, cursors, and strategy
state are persisted, so a reload rebuilds the Collection from disk and
resumes. The write side does not. An optimistic mutation lives only in
TanStack DB memory until `onInsert` / `onUpdate` / `onDelete` confirms against
the Backend. If the tab reloads, crashes, or stays offline, the user's edit is
silently lost. The promise an offline-capable engine must keep is: **an edit,
once made, survives anything short of the user clearing their browser**.

Two write shapes need it:

1. **Entity writes** — insert/update/delete on one Entity. The overwhelming
   majority.
2. **Offline Actions** — operations whose intent spans Entities or must run
   on the server (archive a project, move money).

## The model

### The Outbox

One stored entity in the Sync Store holding every write the Backend has not
confirmed yet. It is a property of the Std Sync, like Platform:

```typescript
const std = createStdSync({ platform: browser(), outbox: true });
```

Off (the default) is today's behavior, unchanged: online writes work, offline
writes fail and roll back. On means every write goes through the Outbox. The
Sync Store's durability decides whether the Outbox survives a reload — Memory
lasts the session, IndexedDB survives — and there is no separate knob.

### Every write does two steps

`insert`, `update`, `delete`, `pacedUpdate`, and an Offline Action all:

1. TanStack applies the optimism at once.
2. The handler **writes an Outbox Entry** — the edit is now safe — then
   **waits until the Entry is gone** (a Waiter).

Entry gone → Waiter resolves → TanStack drops the optimism; the Sync Replica
already holds the confirmed Entity, so the row does not move. Entry marked
`failed` → Waiter rejects → TanStack rolls the optimism back.

Enqueue is always an insert. No read, no merge, nothing to race — any tab, any
time.

### Entity writes

Each transaction is its own Entry with `op` (`insert` | `update` | `delete`),
`base` (the item as the user saw it at edit time — never refreshed), and
`changes`. Entries of one Entity share a Queue. At Request
time the Drainer folds the Queue's pending Entries, oldest first, into one
request:

| so far                | next        | result                     |
| --------------------- | ----------- | -------------------------- |
| —                     | insert `v`  | insert `v`                 |
| insert `v`            | update `c`  | insert `v + c`             |
| insert                | delete      | nothing — Entries deleted  |
| update (`base`, `c1`) | update `c2` | update (`base`, `c1 + c2`) |
| update                | delete      | delete                     |
| delete                | insert `v`  | update (`v`)               |

The fold is a pure domain function over the stored (encoded) values; `changes`
merge by shallow spread. Single-item Collections fold too — update + update
only.

The Request calls the unchanged `onInsert([value])`,
`onUpdate({ current: base, updates: changes })`, or `onDelete({ current })`.
The result flows to `applyToSyncReplica` exactly as today; Sync State is
untouched.

### Offline Actions

```typescript
const archiveProject = std.createOfflineAction({
  name: 'archive-project', // unique + stable: the routing address
  payload: Schema.Struct({ projectId: Schema.String }),
  onMutate: ({ projectId }) =>
    projects.update(projectId, (d) => {
      d.archived = true;
    }),
  mutationFn: ({ projectId }) => api.archiveProject(projectId), // the Request
  queue: ({ projectId }) => projectId, // optional; omit = one Queue per action
});

const tx = archiveProject({ projectId: 'p1' }); // a TanStack transaction
await tx.delivered; // rejects on failure
```

Built on TanStack's `createOptimisticAction`: `onMutate` must be synchronous
and its writes are captured by the action, never becoming Entity Entries. The
action's transaction does the same two steps. TanStack completes a transaction
with no mutations without calling its `mutationFn`, so an action whose
`onMutate` writes nothing (or changes nothing) is enqueued by the action
itself; `tx.delivered` is the promise to await in every case. Creating the action registers
its Handler under `action:<name>`; duplicate names throw. Action Queues
fly one Entry at a time, oldest first. A failed Entry does not stop its Queue.
A non-idempotent operation is not an Outbox candidate — use a plain
`createOptimisticAction` and it stays online-only.

### The Handlers

The Drainer never imports a Collection or an action. Each Collection
registers a Handler under `collection:<name>` when it is built (its
Mutation Callbacks, `applyToSyncReplica`, and its codecs); each Offline
Action registers under `action:<name>` when created. The Drainer resolves an
Entry to a handler by that name — one registry, one lookup, one branch on the
Entry variant. **An Entry whose handler is not registered in the leader tab
stays `pending`**: a missing handler is that tab's gap (a route not visited, a
Collection built later), never the Entry's fault, and failing it would roll
back a user's edit with no recovery. Registering a handler signals the
Drainer, so a late Collection or action drains as soon as it exists. Register
at boot when you can — until a leader with the handler appears, the Entry
waits.

### The Drainer

One per Std Sync, under one `Outbox Drain` Leadership lock. Any tab writes
Entries; only the leader flies them.

```
drainer (leader):
  on start: every in-request → pending

  reader loop:
    wait for a signal: local enqueue, Outbox Channel `enqueued`, Connectivity online, slow poll
    queues = distinct Queues with pending Entries
    for each queue: fork semaphore(queue).withPermit(work(queue))

  work(queue):                          // holds the Queue's permit
    loop:
      group = entity Queue ? all pending Entries, oldest first
                          : the oldest pending Entry
      if none: return
      mark group in-request
      handler = registry.request(group.name)
      if none: mark group pending; return   // wait for a leader that has it
      request = fold(group)            // actions: the Entry itself
      if request is nothing: delete group; ring; continue
      fly(handler, request)
        ok    → result to Sync Replica; delete group; ring
        throw → mark group failed; ring
```

Properties that fall out: `in-request` means executing, never queued; the
semaphore is the queue, so a Queue is strictly FIFO and Queues run in parallel;
a duplicate trigger finds nothing and returns; Entries that arrive during a
Request fold into the next group. Losing the lock interrupts the reader and
every `work` fiber; Entries stay where they are. No Requests while
Connectivity reports offline. "Ring" is the Outbox Channel doorbell — the
Drainer never touches a Waiter directly.

### Errors

The Outbox does not retry. A Request returns, throws, or is interrupted:

- return → Entries deleted;
- throw → Entries `failed`; their Waiters reject; optimism rolls back; the
  Queue continues;
- interrupted (lock lost, tab gone) → Entries stay `pending`; the next
  Drainer re-flies them.

A callback that finds the Backend unreachable may fail with the exported
`OutboxUnreachable` error: the group returns to `pending` and the Drainer
waits for the next signal. Retries, timeouts, and backoff live inside the
callback. A `failed` Entry's only exit in v1 is `discard`.

### The pending transaction

While its Entry is in the Outbox, a transaction is `persisting`: optimism
shown, the row's TanStack `$synced` is `false`, `isPersisted` unresolved.
Awaiting it blocks until delivery — document this loudly. Accepted v1 limit:
TanStack parks incoming sync for a Collection while any of its transactions
persists (`collection/state.ts`, `commitPendingTransactions`); offline there
is no incoming sync, and online a Request ends quickly.

The hand-rolled `PendingTracker` (`utils.pendingCount` /
`utils.subscribePending`) is removed. Per-row state is TanStack's `$synced`;
the durable, cross-tab queue is `std.outbox.entity`.

### Waiters and cross-tab

Waiters live in the tab-local Outbox runtime, outside the Leadership lock,
for the life of the Std Sync. A Waiter observes a store row; it owns nothing.
So: Tab A enqueues and waits; Tab B is leader, flies the Entry, deletes it,
and rings the Outbox Channel (`{ id, outcome }`); A's Waiter re-checks the
store, finds the row gone, resolves. Leadership can move any number of times
in between and no promise is touched.

The doorbell is never trusted: a Waiter **checks the store first**, then
re-checks on every doorbell, any Peer Message, Connectivity online, and a
slow poll. Gone → resolve; `failed` → reject. This also closes the
replay-vs-Drainer race: a reloaded tab whose Entry the leader already flew
resolves on the first check.

### Ready Gate and replay

TanStack Collections are lazy — sync starts on first subscriber or
`preload()` — so "wait until every Collection is ready" needs `preload()`.
After `createStdSync`, the Std Sync preloads every Collection its Tracker
holds; when all are ready, the Ready Gate opens:

1. **Entity replay** happens per Collection at its own ready (before the
   gate for boot Collections; whenever, for Collections created later):
   each non-`failed` Entry of that Collection, per Queue in `enqueuedAt`
   order, is re-issued through its front door (`insert` / `update` /
   `delete` with the stored `changes`) carrying typed replay metadata. The
   handler sees the flag, skips the enqueue, and joins as a Waiter. An insert
   whose id already exists replays as an update.
2. **Action replay** happens once, at the gate, for every non-`failed` action
   Entry: re-issued by name with the persisted payload, same metadata. An
   Entry whose action is not registered, or whose payload fails decode, is
   skipped here and waits in the store; an action created later replays it
   at creation.
3. **The Drainer starts** (and waits for Leadership).

A Collection nobody subscribes to is hydrated once and GC'd after `gcTime`.

### Conflicts

The Backend applies arrival-order last-write-wins, today's behavior. There is
no edit-time stamp on an Entry: `_u` is the cursor axis and cannot carry one,
and a client stamp compared against a server-minted `_u` is two clocks
compared. Idempotency expectations for the Backend: insert-of-existing
behaves as an update, delete-of-missing succeeds.

### Lifecycle and API

- The version gate wipes the Outbox with the rest of the store.
- `std.reset()` — the logout path, in place: stop every Sync execution and
  the Drainer → reject every local Waiter (optimism rolls back) → wipe
  replicas, cursors, state, and Outbox → re-seed every tracked Collection →
  restart executions and the Drainer. Do not write during a reset. The
  TanStack Collection objects the application holds stay the same. Pair with
  a user-scoped Std Sync Name.
- `std.outbox.entity` — the stored entity, for type-safe inspection and
  subscription through the StdTable itself.
- `std.outbox.transaction(id)` — the live TanStack transaction for an Entry
  id in this tab, or `null`.
- `std.outbox.discard(id)` — hard delete; its Waiter rejects, optimism rolls
  back.

Entries carry `collection` / `action`, so there is no Collection-level API in
v1.

### Options

```typescript
createStdSync({ platform: browser(), outbox: true });

std.collection({
  schema,
  onInsert,
  onUpdate,
  onDelete, // unchanged
  outbox: false, // opt this Collection out
  pacing: paceStrategy.debounce({ wait: 300 }), // renamed from updatePacing
});
```

With an Outbox, the Outbox is the pacer: `pacedUpdate` is `update`, and
`pacing` is ignored with a one-time warning. `pacing` configures the
in-memory pacer used when there is no Outbox.

## Where each piece lives

Sync is layered as the story's zoom levels (ADR 0007): `std-sync → collection →
strategy / outbox → worker → platform → domain`. The Outbox is one Module Graph
in the `outbox` layer; dependencies point down.

| home              | module                                   | job                                                                                                                                               |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync.domain`     | `stored-entity`                          | The stored Outbox Entry schema, version-gated with every other stored entity.                                                                     |
| `sync.domain`     | `identity`                               | `HandlerName` (`collection:<name>`, `action:<name>`).                                                                                             |
| `sync.domain`     | `connectivity`                           | The `Connectivity` contract; `alwaysOnline` when no Platform reports one.                                                                         |
| `sync.outbox`     | `entries`                                | `OutboxEntry`, `QueueKey`, `Request`, the errors, replay metadata, and the `EntryStore` over the Sync Store.                                      |
| `sync.outbox`     | `handlers`                               | `Handler` and the by-name registry the Drainer looks up.                                                                                          |
| `sync.outbox`     | `waiters`                                | Tab-local promises that observe the store.                                                                                                        |
| `sync.outbox`     | `doorbell`                               | The Outbox Channel.                                                                                                                               |
| `sync.outbox`     | `narration`                              | `narrateOutbox`, `narrateRequest`, `requestOutcome`.                                                                                              |
| `sync.outbox`     | `drainer`                                | `foldQueue` and `runDrainer`: reader loop, per-Queue semaphores, Connectivity gate.                                                               |
| `sync.outbox`     | `offline-action`                         | `makeOfflineActions`: `create` builds one Offline Action, registers `action:<name>`, enqueues and waits; `replayAll` runs once at the Ready Gate. |
| `sync.outbox`     | `outbox` (facade)                        | `makeOutbox` assembles entries, handlers, waiters, doorbell, actions, and the Drainer into `OutboxRuntime`.                                       |
| `sync.collection` | `mutation`, `outbox-replay`              | Every Collection write becomes an Entry and registers the Collection's Handler; entity replay at ready.                                           |
| `sync.std-sync`   | `std-sync` (`ready-gate.ts`, `reset.ts`) | `outbox: true`; Ready Gate; `std.outbox.*`; `std.reset()`; owns the Drainer scope and supervises it under Leadership.                             |
| `sync.platform`   | `browser`                                | Supplies `connectivity` (`navigator.onLine` + `online` / `offline` events).                                                                       |

The two decoupling points are the Handlers (the Drainer never sees a
Collection or an action) and the Waiters (the lock never sees a promise).

## Implementation phases

Each phase ships and is testable independently.

### Phase 1 — Outbox core (isolated, no wiring)

- `domain/outbox-entry`: types, `queueKey`, `foldQueue`, `OutboxUnreachable`,
  replay metadata schema, channel codec, `Connectivity` type.
- `persistence/sync-store`: `storedOutboxEntryEntity`, wipe list, `provide`
  details widened.
- `persistence/outbox`: the store operations.
- `runtime/outbox`: enqueue, Waiters, Handlers, signal hub.
- `workers/outbox-drain`: the Drainer.
- Tests against the Memory store: fold table, FIFO within a Queue, parallel
  Queues, duplicate triggers, in-request reset on start, interruption leaves
  Entries pending, failure marks and continues, unregistered handler fails,
  `OutboxUnreachable` returns to pending, Waiter resolves on a store check
  with no doorbell.

### Phase 2 — entity queue wiring

- Delete `runtime/pending-mutations`, `utils.pendingCount`,
  `utils.subscribePending`; README points at `$synced`.
- `composition/*/mutations.ts`: behind `outbox`, enqueue then `delivered`;
  `pacedUpdate` delegates to `update`; `pacing` warns; register the Request
  Handler.
- `leadership`: `OutboxDrain` role and scoped identity.
- `sync.ts`: `outbox` option; Drainer under `superviseStrategy`; browser
  Platform supplies Connectivity.
- Entity replay at Collection ready, with typed replay metadata.
- Flow tracing: Outbox participant with enqueue / request / outcome
  activities.
- Tests: `outbox` off is byte-for-byte today's behavior; reload mid-request
  loses nothing; failure rolls back; leader handoff re-flies; a Waiter in a
  non-leader tab resolves after the leader's Request.

### Phase 3 — Ready Gate, reset, cross-tab, API

- `CollectionHandle.ready` / `reset`; Ready Gate in `sync.ts`.
- Outbox Channel doorbell plus store re-check on Peer Message / online /
  poll.
- `std.reset()`; version-gate discarded-count event.
- `std.outbox.entity / transaction / discard`.

### Phase 4 — Offline Actions

- `createOfflineAction` on `createOptimisticAction`: registers
  `action:<name>` (duplicates throw), payload schema, `queue`, action replay
  at the Ready Gate.
- Tests: Queue independence, in-Queue ordering, failure continues the Queue,
  reload replay of queued actions, unregistered action stays pending until
  registered.

### Phase 5 — docs

- Documented idempotency expectations (insert-of-existing → update,
  delete-of-missing → success), the blocking-await rule, README updates, Sync
  Stories: fast edits offline → reload → reconnect; failed Entry inspection
  and discard; logout reset.

## Implementation contracts

Where this section is silent, follow `../CONTEXT.md` (vocabulary),
`../../persistence/sync-store/sync-store.ts` (stored entity conventions), the
existing workers (worker shape), and laymos layering.

### Stored entity

`SyncStoredOutboxEntry`, key = Entry id (the TanStack transaction id),
`.primary({ pk: ['sync'] })` with an index by `queue` + `enqueuedAt`:

- `sync` (Std Sync Name), `queue`, `status` (`'pending' | 'in-request' |
'failed'`), `enqueuedAt`
- entity Entries: `collection`, `op`, `base` (`Schema.encode` of the item),
  `changes` (`Schema.partial(schema)` encode)
- action Entries: `action` (name), `payload` (payload schema encode)

Both codecs come from the registered Handler. Hard delete only. Read
status through the StdTable; no subscribe or size helpers.

### Handler / Waiter contract

`runMutations`, when `outbox` is on: insert the Entry, then
`yield* outbox.delivered(entryId)` instead of calling the user callback.
`delivered` checks the store first, then resolves when the Entry is deleted
and fails when it is marked `failed` or discarded. The Drainer is what invokes
`onInsert` / `onUpdate` / `onDelete` / `mutationFn` through the Request
Handler; results flow to `applyToSyncReplica` as today.

### Handlers

`registerRequest(name, handler)` / `request(name)` on the runtime `outbox`
door. Names are `collection:<Collection Name>` and `action:<action name>`.
A handler is `{ fly(request): Effect<void, unknown>, codecs }`; the Drainer
decodes with the handler's codecs, never with a schema of its own.

### Replay metadata

Export `outboxReplay(entryId)` producing the typed `metadata` object and a
Schema that decodes `mutation.metadata` back; the handler branches on the
decode, never on a string key.

### Errors

Add `OutboxUnreachable` to `domain/outbox-entry` as a `Schema.TaggedError`
class (usable as an Effect failure or a thrown defect from non-Effect
clients). Everything else thrown by a callback marks the group `failed`.

### Leadership

`LeadershipRole` variant `{ _tag: 'OutboxDrain' }`. `leadershipIdentity`
takes `{ scope: readonly string[]; role }`; the Drainer's scope is
`[syncName]`.

### Connectivity

`Connectivity = { isOnline: () => boolean; subscribe: (listener) => () => void }`
as a plain object on `StdSyncPlatform` (like `peerSync`, not a Layer).
Absent means always online.

## Out of scope (deliberate)

Field-level merge, CRDT collaborative editing, cross-tab visibility of unsent
optimistic state, at-rest encryption, Outbox-level retry policy, retrying a
`failed` Entry, halting a Queue on failure, per-call opt-out, cancelling an
in-request Entry, and edit-time conflict stamps.
