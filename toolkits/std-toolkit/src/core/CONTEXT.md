# core — Ubiquitous Language

The shared spine of std-toolkit. Defines the **Entity** model and metadata vocabulary that every other context (eschema, db, sync) speaks. core owns these terms; other contexts reference them rather than redefining them. See the root `CONTEXT-MAP.md`.

## Language

**Entity**:
One record shaped as `{ value, meta }`. `value` is an ESchema value with no top-level `_v`; **Entity Meta** says which **version** it is in. This one shape is used everywhere: database results, **Broadcaster**, **Change Notice**, transport, and the [[sync]] Sync Store. An Entity read from the database has been migrated, so its `_v` is the reader's latest version; the same Entity sent to another process still says which version it is in, so a newer receiver can migrate it and an older one can recognize that it cannot read it.
_Avoid_: StoredEntity, MigratedEntity, EncodedEntity, DecodedEntity, WireEntity.

**EntitySchema**:
The sole complete-entity schema. Reading accepts an **Entity** in any known **version** and migrates its value to the latest, updating `_v`; writing produces the latest version. Database, Sync, Peer Sync, and transport integrations use it instead of rebuilding entity conversion separately. An Entity whose `_v` is newer than any version the reader knows fails with a distinct `OutdatedVersion` error rather than a generic parse failure, so a caller can tell an out-of-date reader from bad data.
_Avoid_: Entity codec, WireSchema.

**Entity Meta**:
The system metadata block attached to every entity. Fields:

- `_e` — **type tag**: which entity type this is.
- `_v` — **version**: which eschema version `value` is in. A receiver reads it to decide whether it can read the value: an older known version is migrated, an unknown newer one cannot be read.
- `_u` — **update key**: a monotonic ULID string (built-in adapters) or an ISO-8601 timestamp (backends that can't adopt ULIDs); higher lexicographic value is the more recent write, so a deployment must use one format uniformly. `uTime` extracts the millisecond time from either.
- `_d` — **deletion flag**: `true` marks the entity a tombstone.
- `_s` — **server observation time** (optional, epoch ms): when the server recorded the entity.
- `_c` — **client receipt time** (optional, epoch ms): when the client received it.

How a given field is _interpreted_ (convergence, cadence, type-ownership) belongs to the consuming context; core only defines the field and its base meaning.
_Avoid_: Header, system fields, envelope.

**SingleEntity**:
The singleton counterpart of an **Entity** — one entity with no id field. Carries reduced **Entity Meta** without deletion or observation fields.
_Avoid_: Singleton row, single record.

**Broadcaster**:
The application-facing outbound hook for confirmed entity writes, and the untyped, in-process fan-out engine underneath **subscribe**. It receives a batch of **Entities** after every successful write — a single-element batch for one write, the full op list for transactions and bulk inserts — and exposes them as a `changes` Stream. Whoever provides the layer decides where changes go and owns any transport encoding. Optional — writes proceed without it, and an absent Broadcaster yields an empty subscribe Stream rather than failing. A default in-memory implementation (`defaultBroadcaster`, Effect PubSub-backed) ships so consumers get subscribe/publish without writing their own fan-out. The typed entry points ([[db]] Entity surface, StdTable) forward through it rather than exposing it directly.
_Avoid_: EventBus, emitter, channel.

**Change Notice**:
The notification a subscriber receives when a committed write matches its subscription. Its payload is the same **Entity** shape Broadcaster already carries — no separate operation-kind field; a delete is inferable from `_d`. Fires only as a byproduct of a real committed write, never manually. Delivery is in-process, fire-and-forget, unordered, with no replay of missed notices.
_Avoid_: EventBus, emitter, subscription callback. Deliberately distinct from [[sync]] Peer Sync, which is best-effort, same-origin, multi-tab delivery for freshness rather than a per-write notification — see Peer Sync's own definition.

**StdToolkitError**:
The union of context-level toolkit errors such as [[db]] `DatabaseError`, `ESchemaError`, and `SnapshotError`. It is a type-level umbrella, not a base class.
_Avoid_: ToolkitError, BaseError, shared error superclass.
