# Offline writes are per-entity slots and named partitioned actions

Sync's read side is durable — replicas, cursors, and strategy state survive
reloads — but a write is only as durable as the tab it was made in. An
optimistic mutation lives in TanStack DB memory until its handler confirms, so
a reload, crash, or long offline window loses the user's edit. This ADR makes
durability a property of the write itself.

## The write is a destination, not a diary

Entity-level offline writes are stored as **Outbox Slots**: at most one durable
record per entity holding the latest desired state (`upsert`) or a tombstone
(`delete`). A new edit overwrites the entity's slot; insert+update collapses to
one upsert, an unsent insert followed by delete removes the slot entirely.
Because a final state depends on nothing but itself, there is no operation
chain, no replay ordering, and no cascading failure across entities. Operations
whose _intent_ matters — cross-entity transactions, server-computed effects —
are not slots; they are **Offline Actions** (below).

## "Last write wins" means last edit, not last arrival

Ids are minted on the client (ULID), and every slot carries a `proposedU`: a
stamp minted at the moment the user edited, disciplined as a hybrid logical
clock (never behind the newest update stamp this client has seen).

**The proposal never becomes `_u`.** `_u` is also the cursor axis for
incremental sync; writing an old edit-time stamp into `_u` would land an
accepted write _behind_ other clients' cursors, making it invisible to
cursor-based sync forever. `_u` therefore stays server-minted at write time
(cursor and convergence axis — every accepted write is always ahead of every
cursor), and client convergence continues to compare `_u` alone, unchanged.

The conditional apply is **not wired into the toolkit's server side**. The
backend author writes it as an ordinary db conditional update in their RPC
handler — `getAndUpdate(key, updates, { check: (current, meta) => meta._u <
proposedU })` — with a failed check answered by returning the current
authoritative entity (superseded). The only db change this needs is exposing
Entity Meta to check invariants, which today receive the value alone.
Comparing the edit-time proposal against the stored _arrival-time_ `_u` is
deliberately conservative: arrival is always at or after edit, so a stale
edit can never overwrite a newer one, though an offline edit may be
superseded by a competing write that _arrived_ after it was made. Exact
edit-versus-edit fairness — an optional **edit stamp** (`_p`) meta field
recording the winning `proposedU` and compared instead of `_u` — is the
documented refinement, not required for v1. Every delivery has one of three
outcomes:

- **applied** — the proposal won; the confirmed Entity flows back through
  `applyToSyncReplica` and normal sync.
- **superseded** — the backend already holds something newer; the server
  returns the authoritative Entity, convergence accepts it as a no-op, and the
  slot is dropped. Not an error, and needs no dedicated code path.
- **rejected** — a backend invariant refused the write; the slot is dropped,
  the optimistic state rolls back, and the failure is surfaced.

Slot retries need no idempotency key: re-sending the same `proposedU` is a
duplicate under the conditional write. Actions carry explicit idempotency keys.

Clock drift is accounted for, not solved. The cursor axis is immune by
construction (`_u` is server time only), so drift can never hide a write from
sync. Drift affects only conflict _fairness_ between the same user's devices:
a behind-clock device is defended by the HLC floor (it can never stamp behind
data it has already seen, so it cannot lose to itself), and an ahead-clock
device is bounded by a server tolerance on `proposedU` (minutes ahead of
server time; beyond it the write is refused as malformed rather than winning
conflicts for a year). Within the tolerance, an ahead clock wins conflicts
unfairly for its skew duration — a accepted, documented degradation, never a
correctness or sync-visibility failure. `proposedU` is optional end to end: a
backend that ignores it simply stamps `_u` on arrival and skips the `_p`
compare, degrading to arrival-order LWW (today's behavior) without breaking
anything.

## Presentation goes through TanStack's front door

There is no custom overlay layer. A pending offline write is a live TanStack
optimistic mutation: the mutation handler stays unresolved until the outbox
delivers its entry, and throws only on rejection, so TanStack's own rollback
undoes the optimism. `$synced` and `$origin` therefore stay truthful for the
whole offline window. On boot, replay re-invokes the same public operations —
stored diffs for entity ops, named actions with persisted payloads — flagged as
replays so they re-attach to their existing entries instead of enqueueing new
ones. Closures never persist; only data does, which is why actions are named
and payload-schema'd. Awaiting a write while offline blocks until delivery
(Firestore semantics); a separate durable acknowledgment reports "safely
queued".

## Offline is orthogonal to pacing

Pacing decides _when_ to send (in-memory smoothing of rapid edits); offline
decides _what survives_ when sending fails or cannot happen. They are sibling
collection options — any pace strategy, or none, combines with `offline`.
Eager writes still want durability, so no combination is restricted.

## Actions are named, partitioned FIFO lanes

`createOfflineAction` registers a **unique, stable name** with a schema'd (and
where possible eschema'd, hence migratable) payload, an `onMutate` optimistic
application, and a `mutationFn` executed at drain time. Entries are addressed
by `(namespace, action name, partition key, sequence)`. An optional
`partition` function shards the queue into independent FIFO lanes: lanes drain
in parallel, entries within a lane drain strictly in order, and a stuck lane
never blocks another. On rejection a lane follows its declared policy: `halt`
(park the lane durably, app resolves it), `discard` (drop the remainder,
rolling back their optimism), or `continue` (fail only this entry). Entries
whose action name no longer exists are parked and reported through
`onUnknownAction`. Slots and action lanes are otherwise independent; overlap
on the same entity is arbitrated by the LWW rule, and flows that need strict
ordering belong entirely inside one action lane.

## One store, one election

Outbox records are new stored entities in the existing Sync Store StdTable, so
Memory versus IndexedDB versus SQLite durability remains the platform's single
choice, the version gate clears the outbox on dataset resets (loudly, with a
discarded-count event), and `reset()` gives logout one wipe covering replicas,
cursors, state, and outbox. Any tab may enqueue — store writes are
transactional — but **only the leader drains**, as a new `OfflineDrain`
Leadership role: one lock per collection for the entity lane (per-entity
serialization is the drainer's in-flight map, not a lock), one lock per active
action lane. In-flight work is not in the slot: the drainer claims a slot by
clearing it, later edits write a fresh slot, and a landed flight resolves every
waiter at or below the generation it carried, which keeps awaiting callers
correct under coalescing. Completion status is broadcast on the existing peer
channel so a non-leader tab's pending handler resolves; the store remains the
source of truth on boot.

## Why not `@tanstack/offline-transactions`

The official package validates the architecture — outbox before dispatch,
named handlers, retry with backoff, leader election, `NonRetriableError`
classification — and its vocabulary and test scenarios are deliberately
mirrored. It is not adopted because its semantics are the ones this design
rejects for the entity lane: a persisted operation diary with no
cross-transaction coalescing, one global FIFO where a stuck transaction blocks
every entity, and non-leader tabs that do not persist offline writes at all.
It would also duplicate storage, leader election, retry, and telemetry that
std-toolkit already owns in Effect-native form.

## Out of scope

Field-level merge (entity-level LWW is deliberate; finer grains are a later
refinement of the same rule), CRDT collaborative editing, cross-tab visibility
of unsent optimistic state, and at-rest encryption of the local store.
