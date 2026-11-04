# entity — Ubiquitous Language

The shared spine of std-toolkit, at the bottom of `schema`. Defines the **Entity** model and metadata vocabulary that every other context (eschema, db, replica) speaks. entity owns these terms; other contexts reference them rather than redefining them. See the root `CONTEXT-MAP.md`.

## Language

**Entity**:
One record shaped as `{ value, meta }`. `value` is an ESchema value with no top-level `_v`; **Entity Meta** says which **version** it is in. This one shape is used everywhere: database results, [[db]] **Change Notices**, transport, and the [[replica]] Store. An Entity read from the database has been migrated, so its `_v` is the reader's latest version; the same Entity sent to another process still says which version it is in, so a newer receiver can migrate it and an older one can recognize that it cannot read it.
_Avoid_: StoredEntity, MigratedEntity, EncodedEntity, DecodedEntity, WireEntity.

**entity schema**:
The sole complete-entity schema, read from the Entity's ESchema as [[eschema]] **entity schema** (`X.entity`). Reading accepts an **Entity** in any known **version** and migrates its value to the latest, updating `_v`; writing produces the latest version. Database, Replica, and transport integrations use it instead of rebuilding entity conversion separately. An Entity whose `_v` is newer than any version the reader knows fails with a distinct `OutdatedVersion` error rather than a generic parse failure, so a caller can tell an out-of-date reader from bad data.
_Avoid_: EntitySchema(X), Entity codec, WireSchema.

**Entity Meta**:
The system metadata block attached to every entity. Fields:

- `_e` — **type tag**: which entity type this is.
- `_v` — **version**: which eschema version `value` is in. A receiver reads it to decide whether it can read the value: an older known version is migrated, an unknown newer one cannot be read.
- `_u` — **update key**: a monotonic ULID string (built-in adapters) or an ISO-8601 timestamp (backends that can't adopt ULIDs); higher lexicographic value is the more recent write, so a deployment must use one format uniformly. `uTime` extracts the millisecond time from either.
- `_d` — **deletion flag**: `true` marks the entity a tombstone.

How a given field is _interpreted_ (convergence, type-ownership) belongs to the consuming context; entity only defines the field and its base meaning.
_Avoid_: Header, system fields, envelope.

**SingleEntity**:
The singleton counterpart of an **Entity** — one entity with no id field. Carries reduced **Entity Meta** without deletion or observation fields.
_Avoid_: Singleton row, single record.

**StdToolkitError**:
The union of context-level toolkit errors such as [[db]] `DatabaseError`, `ESchemaError`, and `SnapshotError`. It is a type-level umbrella, not a base class.
_Avoid_: ToolkitError, BaseError, shared error superclass.
