# Sync

Sync keeps TanStack DB Collections fresh from an authoritative Backend while
preserving enough client state to converge safely. Shared Entity vocabulary is
defined by [core](../core/CONTEXT.md).

## Language

**Sync**:
The bounded context that connects backend-confirmed Entities to TanStack DB
Collections. It includes replication, projection, strategies, and Peer Sync.
_Avoid_: TanStack Sync, generic frontend sync.

**Backend**:
The authoritative source of Entities. Client replicas and projections may be
temporarily fresher or staler, but they do not replace its authority.
_Avoid_: Source of Truth, server truth.

**Std Sync**:
One named Sync runtime created for a Backend dataset or feature scope.

**Name**:
A normalized readable label used within a Sync namespace. Inputs that normalize
to the same Name in one namespace conflict.

**Std Sync Name**:
The stable normalized Name that identifies a Std Sync namespace.

**Collection Name**:
A schema Name qualified by its Std Sync Name, such as
`acme-production.todo-items`. It identifies one Collection within a Sync
namespace; the original schema name remains the Entity's `_e` identity.

**Entity Ownership**:
The rule that one Entity `_e` belongs to exactly one Collection in a Std Sync.

**Collection**:
The Sync-owned boundary for one Entity type and its TanStack DB Collection
Projection, Sync Replica, Sync State, and Peer Channel.

**Collection Projection**:
The ephemeral TanStack DB view built from accepted **DecodedEntities** in a Sync Replica as **CollectionItems** exposed to queries.
_Avoid_: Sync Replica, cache.

**CollectionItem**:
The latest decoded value exposed by a TanStack DB Collection, validated against the latest schema and shaped for collection queries and mutations. It is projected from a **DecodedEntity** and is not itself an entity envelope.
_Avoid_: CollectionRow, DecodedEntity, SyncEntity.

**Sync Replica**:
The client-side set of backend-confirmed **DecodedEntities** known to one Collection. Its Sync Store representation is encoded. It is a convergent local copy, never the authority.
_Avoid_: Source of Truth, cache.

**Sync Store**:
The storage boundary containing encoded representations of Sync Replicas, Sync
State, and the Outbox. A Memory or durable realization changes persistence
across reloads, not peer freshness.
_Avoid_: Sync Persistence Table, offline cache.

**Sync State**:
Strategy-owned progress used to resume backend synchronization. It is separate
from the Sync Replica and is not advanced by mutations, Registry Broadcasts, or
Peer Sync.
_Avoid_: Sync Replica cursor.

**Convergence Rule**:
The rule that accepts a newer Entity `_u`, treats an older or duplicate Entity
as a successful no-op, and retains accepted tombstones in the Sync Replica.

**Projection Position**:
A Collection Projection's local position in its Sync Replica. It is not backend
progress and not Sync State.

**Sync Strategy**:
A worker policy that obtains backend-confirmed Entities and owns the Sync State
needed to resume its work.

**Sync Source**:
A Sync-owned description of one Backend delivery mode, built from application-provided backend operations. It yields decoded backend-confirmed entities; its implementation owns any persistence or transport decoding behind that boundary. It does not own cursor meaning, Sync State, or the surrounding Collection or Partition lifecycle.
_Avoid_: Sync Strategy, subscription callback.

**Leadership**:
Exclusive ownership by one Sync participant of one backend-reading role while
equivalent participants remain dormant and eligible for takeover.
_Avoid_: Strategy Leadership, query lock, fetch mutex, primary tab.

**Worker**:
Any loop Sync runs forever: a Strategy Session, a Cadence Repair, or the
Outbox Drainer. Every Worker runs under the Supervisor and holds one
Leadership role; nothing loops outside one.
_Avoid_: job, participant (a Sync Flow term), task.

**Strategy Session**:
One running Sync Strategy over one scope: a Global Sync, a Partition Sync, or
the single Strategy Session of a single-item Collection. It is a Worker.
_Avoid_: strategy run, engine, executor.

**Supervisor**:
The single door every Worker runs through: it holds one Leadership role, runs
the Worker forever, and restarts it with spaced retries on failure.
_Avoid_: strategy lifecycle, fiber manager, runner.
**Platform**:
The environment one Std Sync instance runs in: where its Sync Store lives,
how concurrent participants coordinate through Leadership and Peer Sync, and
what Connectivity it reports. Chosen once per instance; absent means a solo,
always-online participant with ephemeral state.
_Avoid_: environment detection, deployment target, browser sniffing.

**Partition**:
A ref-counted Sync lifecycle window for one keyed subset. It is unrelated to a
database partition and does not define Collection retention.

**Global Sync**:
The Strategy Session that covers a whole keyed Collection. It is always
running while the Collection is mounted.
_Avoid_: Total sync, full sync.

**Partition Sync**:
The Strategy Session that covers one active Partition of a keyed Collection.
It starts when the Partition becomes active and stops when it becomes inactive.
_Avoid_: Priority sync, partitioned sync.

**Hybrid Sync**:
A keyed Collection running Global Sync and Partition Sync at once, both
converging through the same Sync Replica. A single-item Collection runs exactly
one Strategy Session and is never hybrid.
_Avoid_: Total versus partitioned sync, priority sync.

**Cadence Repair**:
A bounded recheck of recently delivered Entities that repairs timing drift
without owning backend progress. It is configured per Global Sync or per
Partition Sync, runs alongside that Strategy Session and is reported as part of
it, and never applies to a single-item Collection.
_Avoid_: Cadence Sync, Cadence Sync Strategy, collection-level repair.

**Sync Address**:
A readable observability label for a Sync, Collection, Partition, or strategy,
such as `a.b{x=hello-world}.old-to-new`. It is lossy, never parsed, and never a
storage or map identity.
_Avoid_: Storage key, partition identity.

**Registry**:
The in-process router that delivers Registry Broadcasts to Collections owned by
one Std Sync.

**Registry Broadcast**:
Caller-owned ingress of **DecodedEntities** into one Std Sync. Persisted delivery converges
through the Sync Replica; projection-only delivery remains local to that tab.
_Avoid_: Peer Sync message.

**Peer Sync**:
Best-effort same-origin delivery of accepted, backend-confirmed Entities between
live tabs. It improves freshness while backend synchronization remains the
correctness and repair mechanism.
_Avoid_: Change Notice (see [core](../core/CONTEXT.md) — a per-write notification, not this best-effort tab relay), authoritative sync, Peer Fast Path.

**Peer Channel**:
The transport owned by one qualified Collection Name through which Peer
Messages are sent and received.

**Peer Message**:
A versioned non-empty envelope of complete confirmed **EncodedEntities** for one
Collection. Receivers validate it and apply the normal Convergence Rule without
relaying it.

**Optimistic Entity**:
A provisional Collection value awaiting Backend confirmation. It is neither
stored in the Sync Replica nor sent through Peer Sync.

**Mutation Callback**:
The application-facing handler for a TanStack DB insert, update, or delete. It receives only decoded CollectionItems and returns a backend-confirmed **DecodedEntity**; any transport encoding belongs to the API client used by the handler.
_Avoid_: Encoded Mutation, transport mutation.

**Outbox**:
The Sync Store record of every write the Backend has not confirmed yet, owned
by one Std Sync. Off by default; on, it is the one path every write takes.
_Avoid_: mutation queue, offline cache, pending writes table.

**Outbox Entry**:
One unconfirmed write in the Outbox: one Entity operation or one Offline
Action call, identified by its transaction id. It is `pending`, `in-flight`
(executing right now), or `failed`.
_Avoid_: slot, outbox item, job.

**Queue**:
The FIFO unit of the Outbox: all Entries of one Entity, or of one Offline
Action name and key. Queues drain in parallel; one Queue drains in order.
_Avoid_: lane, partition (a Sync lifecycle window), shard.
**Outbox Drainer**:
The single leader-owned Worker that folds a Queue's pending Entries into one
Request, resolves its Handler by name, sends it, and deletes or fails the
Entries by the outcome. It knows nothing about Waiters.
_Avoid_: outbox worker, sync worker, flush.
**Handler**:
The code that sends one Request, registered by name in a Std Sync: a
Collection's Mutation Callbacks plus its replica apply (`collection:<name>`)
or an Offline Action's function (`action:<name>`). An Entry whose Handler is
not registered in the leader tab stays `pending` until a leader that has it
appears; registering a Handler signals the Drainer.
_Avoid_: flight handler, flight registry, mutation handler, executor.
**Waiter**:
A tab-local promise that resolves when its Outbox Entry leaves the store and
rejects when the Entry is `failed` or discarded. Waiters observe the store;
they own nothing, survive Leadership changes, and re-check the store on every
Outbox Channel message, Peer Message, Connectivity change, and slow poll.
_Avoid_: pending promise, transaction owner, lock holder.

**Connectivity**:
The Platform-reported online/offline signal the Drainer gates Requests on. The
browser Platform reads `navigator.onLine`; no Platform means always online.
_Avoid_: network status, reachability (a Backend property the callback
discovers).

**Ready Gate**:
The moment a Std Sync has preloaded every Collection it tracks so each is
ready. Offline Action replay and the Drainer start after it; a Collection
created later replays its own entity Entries at its own ready.
_Avoid_: settle window, boot delay, hydration barrier.

**Reset**:
The in-place Std Sync operation for logout: stop every Sync execution and the
Drainer, fail every local Waiter, wipe the Sync Store, re-seed every tracked
Collection, and restart. The TanStack DB Collection objects the application
holds stay the same.
_Avoid_: dispose (which ends the instance), clear, logout hook.

**Request**:
One send of one folded Queue to the Backend through its Handler. Its Entries
are `in-flight` only while it runs.
_Avoid_: flight, batch.
**Offline Action**:
A named, payload-schema'd operation whose intent spans Entities or must run
on the server, enqueued as one Outbox Entry and executed by the Drainer.
_Avoid_: command, transaction, mutation.

**Outbox Channel**:
The best-effort same-origin doorbell on which any tab announces an enqueued
Entry to the leader and the Drainer announces an Entry's outcome to other
tabs; the Outbox itself remains the truth. It is one more channel from the
Platform's channel factory, named `<Std Sync Name>.outbox`.
_Avoid_: Peer Channel (a Collection's entity relay).

**Sync Event**:
A structured operational fact reported by Sync, including lifecycle, Registry
Broadcast, and best-effort Peer Sync failures.

**Sync Story**:
An executable user journey that explains Sync through named simulation
participants and assertions.
