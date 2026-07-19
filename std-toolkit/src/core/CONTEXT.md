# core — Ubiquitous Language

The shared spine of std-toolkit. Defines the **Entity** model and metadata vocabulary that every other context (eschema, db, tanstack-sync) speaks. core owns these terms; other contexts reference them rather than redefining them. See the root `CONTEXT-MAP.md`.

## Language

**Entity**:
The canonical record shape across the toolkit — `{ value, meta }`, where `value` is the domain data and `meta` is the **Entity Meta** block. The server/wire form of a record.
_Avoid_: Row, document, record (use **Entity**).

**Entity Meta**:
The system metadata block attached to every entity. Fields:

- `_e` — **type tag**: which entity type this is.
- `_v` — **schema version**: the eschema [[eschema]] **version** stamped on the `value`.
- `_u` — **update key**: a monotonic ULID string (built-in adapters) or an ISO-8601 timestamp (backends that can't adopt ULIDs); higher lexicographic value is the more recent write, so a deployment must use one format uniformly. `uTime` extracts the millisecond time from either.
- `_d` — **deletion flag**: `true` marks the entity a tombstone.
- `_s` — **server observation time** (optional, epoch ms): when the server recorded the entity.
- `_c` — **client receipt time** (optional, epoch ms): when the client received it.

How a given field is _interpreted_ (convergence, cadence, type-ownership) belongs to the consuming context; core only defines the field and its base meaning.
_Avoid_: Header, system fields, envelope.

**SingleEntity**:
The singleton form of an **Entity** — one record with no id field. Carries a reduced meta (`_v`, `_e`, `_u`).
_Avoid_: Singleton row, single record.

**Broadcaster**:
The outbound hook for confirmed entity writes. Adapters call `broadcast` with the batch of written entities after every successful write — a single-element batch for one write, the full op list for transactions and bulk inserts. Whoever provides the layer decides where changes go. Optional — writes proceed without it.
_Avoid_: EventBus, emitter, channel.

**StdToolkitError**:
The base error type all toolkit operations extend.
_Avoid_: ToolkitError, BaseError.
