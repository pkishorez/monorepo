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
The application-facing outbound hook for confirmed entity writes. It receives a batch of **DecodedEntities** after every successful write — a single-element batch for one write, the full op list for transactions and bulk inserts. Whoever provides the layer decides where changes go and owns any transport encoding. Optional — writes proceed without it.
_Avoid_: EventBus, emitter, channel.

**StdToolkitError**:
The union of context-level toolkit errors such as [[db]] `DatabaseError`, `ESchemaError`, and `SnapshotError`. It is a type-level umbrella, not a base class.
_Avoid_: ToolkitError, BaseError, shared error superclass.
