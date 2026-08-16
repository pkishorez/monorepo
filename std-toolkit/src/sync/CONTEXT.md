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
The ephemeral TanStack DB view built from a Sync Replica and exposed to queries.
_Avoid_: Sync Replica, cache.

**Sync Replica**:
The client-side set of backend-confirmed Entities known to one Collection. It is
a convergent local copy, never the authority.
_Avoid_: Source of Truth, cache.

**Sync Store**:
The storage boundary containing Sync Replicas and Sync State. A Memory or
durable realization changes persistence across reloads, not peer freshness.
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
A reusable description of one Backend delivery mode, normalized for consumption
by Sync. It does not own cursor meaning, Sync State, or the surrounding Collection
or Partition lifecycle.
_Avoid_: Sync Strategy, subscription callback.

**Leadership**:
Exclusive ownership by one Sync participant of one backend-reading role while
equivalent participants remain dormant and eligible for takeover.
_Avoid_: Strategy Leadership, query lock, fetch mutex, primary tab.

**Partition**:
A ref-counted Sync lifecycle window for one keyed subset. It is unrelated to a
database partition and does not define Collection retention.

**Hybrid Sync**:
A keyed Sync where global coverage and active Partition acceleration converge
through the same Sync Replica.
_Avoid_: Total versus partitioned sync, priority sync.

**Cadence Repair**:
A bounded recheck of recently delivered Entities that repairs timing drift
without owning backend progress.
_Avoid_: Cadence Sync Strategy.

**Sync Address**:
A readable observability label for a Sync, Collection, Partition, or strategy,
such as `a.b{x=hello-world}.old-to-new`. It is lossy, never parsed, and never a
storage or map identity.
_Avoid_: Storage key, partition identity.

**Registry**:
The in-process router that delivers Registry Broadcasts to Collections owned by
one Std Sync.

**Registry Broadcast**:
Caller-owned ingress of Entities into one Std Sync. Persisted delivery converges
through the Sync Replica; projection-only delivery remains local to that tab.
_Avoid_: Peer Sync message.

**Peer Sync**:
Best-effort same-origin delivery of accepted, backend-confirmed Entities between
live tabs. It improves freshness while backend synchronization remains the
correctness and repair mechanism.
_Avoid_: Change Notice, authoritative sync, Peer Fast Path.

**Peer Channel**:
The transport owned by one qualified Collection Name through which Peer
Messages are sent and received.

**Peer Message**:
A versioned non-empty envelope of complete confirmed Entities for one
Collection. Receivers validate it and apply the normal Convergence Rule without
relaying it.

**Optimistic Entity**:
A provisional Collection value awaiting Backend confirmation. It is neither
stored in the Sync Replica nor sent through Peer Sync.

**Sync Event**:
A structured operational fact reported by Sync, including lifecycle, Registry
Broadcast, and best-effort Peer Sync failures.

**Sync Story**:
An executable user journey that explains Sync through named simulation
participants and assertions.
