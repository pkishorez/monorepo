# core — Ubiquitous Language

The shared spine of std-toolkit. Defines the **Entity** model and metadata vocabulary that every other context (eschema, db, sync) speaks. core owns these terms; other contexts reference them rather than redefining them. See the root `CONTEXT-MAP.md`.

## Language

**DecodedEntity**:
An entity shaped as `{ value, meta }` whose `value` is in the latest decoded domain form and therefore has no `_v` stamp. It is the working representation used by application code.
_Avoid_: DomainEntity, runtime entity, bare Entity.

**EncodedEntity**:
An entity shaped as `{ value, meta }` whose portable encoded `value` always carries a `_v` stamp. It is an infrastructure representation used at persistence and transport boundaries, not an application working value.
_Avoid_: WireEntity, StoredEntity, serialized entity, bare Entity.

**EntitySchema**:
The sole complete-entity schema between an **EncodedEntity** and a **DecodedEntity**. Encoding always produces the latest version; decoding accepts every known version and migrates it to the latest decoded form. Database, Sync, Peer Sync, and transport integrations use it instead of rebuilding entity conversion separately.
_Avoid_: Entity codec, WireSchema.

**Entity Meta**:
The system metadata block attached to every entity. Fields:

- `_e` — **type tag**: which entity type this is.
- `_u` — **update key**: a monotonic ULID string (built-in adapters) or an ISO-8601 timestamp (backends that can't adopt ULIDs); higher lexicographic value is the more recent write, so a deployment must use one format uniformly. `uTime` extracts the millisecond time from either.
- `_d` — **deletion flag**: `true` marks the entity a tombstone.
- `_s` — **server observation time** (optional, epoch ms): when the server recorded the entity.
- `_c` — **client receipt time** (optional, epoch ms): when the client received it.

How a given field is _interpreted_ (convergence, cadence, type-ownership) belongs to the consuming context; core only defines the field and its base meaning.
_Avoid_: Header, system fields, envelope.

**SingleEntity**:
The singleton counterpart of a **DecodedEntity** or **EncodedEntity** — one entity with no id field. Carries reduced **Entity Meta** without deletion or observation fields.
_Avoid_: Singleton row, single record.

**Broadcaster**:
The application-facing outbound hook for confirmed entity writes, and the untyped, in-process fan-out engine underneath **subscribe**. It receives a batch of **DecodedEntities** after every successful write — a single-element batch for one write, the full op list for transactions and bulk inserts — and exposes them as a `changes` Stream. Whoever provides the layer decides where changes go and owns any transport encoding. Optional — writes proceed without it, and an absent Broadcaster yields an empty subscribe Stream rather than failing. A default in-memory implementation (`defaultBroadcaster`, Effect PubSub-backed) ships so consumers get subscribe/publish without writing their own fan-out. The typed entry points ([[db]] Entity surface, StdTable) forward through it rather than exposing it directly.
_Avoid_: EventBus, emitter, channel.

**Change Notice**:
The notification a subscriber receives when a committed write matches its subscription. Its payload is the same **DecodedEntity** shape Broadcaster already carries — no separate operation-kind field; a delete is inferable from `_d`. Fires only as a byproduct of a real committed write, never manually. Delivery is in-process, fire-and-forget, unordered, with no replay of missed notices.
_Avoid_: EventBus, emitter, subscription callback. Deliberately distinct from [[sync]] Peer Sync, which is best-effort, same-origin, multi-tab delivery for freshness rather than a per-write notification — see Peer Sync's own definition.

**StdToolkitError**:
The union of context-level toolkit errors such as [[db]] `DatabaseError`, `ESchemaError`, and `SnapshotError`. It is a type-level umbrella, not a base class.
_Avoid_: ToolkitError, BaseError, shared error superclass.
