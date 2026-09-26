# Sync

Sync keeps TanStack DB Collections fresh from an authoritative Backend and
keeps a local copy, so an application opens with its data offline and resumes
where it stopped. Shared Entity vocabulary is defined by
[core](../core/CONTEXT.md). Every edge Sync shares with a Backend or a store
carries [[core]] **Entities**, and every Collection shows their latest eschema
**values**.

## Language

### Instance and Collections

**Sync**:
The bounded context that connects backend-confirmed Entities to TanStack DB
Collections.
_Avoid_: TanStack Sync, generic frontend sync.

**Backend**:
The authoritative source of Entities. Local copies may be temporarily fresher
or staler, but they never replace its authority.
_Avoid_: Source of Truth, server truth.

**Std Sync**:
One named Sync instance: a group of Collections sharing one Platform.
Disposing it stops everything and keeps its stored data.

**Std Sync Name**:
The stable normalized name that identifies a Std Sync and names its stored
data. A renamed Std Sync starts from empty storage; the old data stays until
deleted.

**Collection Name**:
A schema name qualified by its Std Sync Name, such as
`acme-production.todo-items`. The original schema name remains the Entity's
`_e` identity.

**Entity Ownership**:
The rule that one Entity `_e` belongs to exactly one Collection in a Std Sync.

**Collection**:
The Sync-owned boundary for one Entity type: its TanStack DB Collection, Sync
Replica, and Sync State.

**CollectionItem**:
An **Entity**'s latest eschema **value** exposed by a TanStack DB Collection,
with its meta under `_meta`. It is not itself an entity envelope.
_Avoid_: CollectionRow, DecodedEntity, SyncEntity.

**Mutation Callback**:
The application-facing handler for a TanStack DB insert, update, or delete.
Sync hands it the **values** being written, and it returns the
backend-confirmed **Entity**.
_Avoid_: Decoded Mutation, transport mutation.

**Optimistic Entity**:
A provisional Collection value awaiting Backend confirmation. It is never
stored in the Sync Replica.

### Local copy

**Sync Replica**:
The set of backend-confirmed **Entities** known to one Collection, kept in the
Sync Store. It is a convergent local copy, never the authority.
_Avoid_: Source of Truth, cache.

**Sync Store**:
The storage holding a Std Sync's Sync Replicas and Sync State in encoded form.
The Platform provides it.
_Avoid_: Sync Persistence Table, offline cache.

**Sync State**:
A Sync Strategy's saved progress, used to resume reading the Backend. Only its
own Sync Strategy advances it; mutations never do.
_Avoid_: Sync Replica cursor.

**Projection Position**:
How far a Collection's TanStack DB view has read its Sync Replica. It is local,
never backend progress and never Sync State.

**Convergence Rule**:
The rule that accepts a newer Entity `_u`, treats an older or duplicate Entity
as a successful no-op, and retains accepted tombstones in the Sync Replica.

**Outdated Application**:
The state of a participant that receives an Entity whose `_v` is newer than any
version its code knows. It is not an error: Sync ignores that Entity with a
warning and advances neither the Sync Replica nor Sync State for it, so newer
code receives it again after a reload. A Session that meets one stops until
reload, and Sync reports it once per Collection per tab. The only remedy is
newer application code.
_Avoid_: Unsupported version error, version conflict.

### Reading the Backend

**Sync Strategy**:
A policy for reading one scope of the Backend: its options, a Sync State
schema, and a run that yields Entities with the next Sync State. It pulls with
`fetch`, is pushed with `subscribe` from its cursor, or both. Each scope runs
exactly one; built-in and application strategies have the same shape.
_Avoid_: Sync Source, source builder, Subscription, strategy run.

**Partition**:
A ref-counted Sync lifecycle window for one keyed subset: the values whose
[[db]] **key path** reads one string, number, or boolean. It is unrelated to a
database partition. Leaving a Partition stops its Sync; its Entities stay in
the Sync Replica.

**Global Sync**:
The Sync Strategy that covers a whole keyed Collection. It runs while the
Collection is mounted.
_Avoid_: Total sync, full sync.

**Partition Sync**:
The Sync Strategy that covers one active Partition of a keyed Collection. It
starts when the Partition becomes active and stops when it becomes inactive.
_Avoid_: Priority sync, partitioned sync.

**Eager**, **On-demand**, **Progressive**:
The names for a Collection configured with only Global Sync, only Partition
Sync, or both. They follow from configuration and are never configured.
_Avoid_: sync mode, Hybrid Sync.

**Settle Window**:
How long, measured back from the newest `_u` read, a Backend may take to make a
write readable. A strategy that honors it re-reads that window instead of
saving progress past it. Off unless a Collection sets it.
_Avoid_: Cadence Repair, cadence sync, lookback.

### Running

**Session**:
One leader-held run of a Sync Strategy over one scope: Global Sync or one
Partition. It stores each yield in one write and, when the run fails, reruns it
from saved Sync State after a growing delay.
_Avoid_: Worker, Supervisor, Strategy Session, strategy run.

**Leadership**:
Exclusive permission for one participant to run one Session while equivalent
participants wait to take over. Every Session has its own, so different tabs
may lead different Partitions.
_Avoid_: primary tab, query lock, fetch mutex.

**Doorbell**:
The signal a Session's leader sends after storing Entities, so other
participants re-read that Collection from the Sync Store. It carries no
Entities.
_Avoid_: Peer Sync, Peer Message, Change Notice (a [[core]] in-process write
notification).

**Platform**:
The environment a Std Sync runs in: its Sync Store, Leadership, and Doorbell,
chosen together. The default Memory Platform has ephemeral storage, no
Leadership, and no Doorbell.
_Avoid_: store option, environment detection, browser sniffing.

### Reporting

**Sync Event**:
A structured operational fact Sync reports: a failed Session run, an Outdated
Application, or a Platform closed from elsewhere.

**Sync Story**:
An executable user journey that explains Sync through named simulation
participants and assertions.
