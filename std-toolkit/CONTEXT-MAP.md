# Context Map

std-toolkit is a cluster of bounded contexts. Each context owns its own ubiquitous language in a local `CONTEXT.md`. The same word may carry a different meaning in two contexts (e.g. **partition**) — that is intentional; each definition is scoped to its own context.

## Contexts

- [core](./src/core/CONTEXT.md) — the shared spine: the **Entity** model, **Entity Meta**, **Broadcaster**, **Change Notice**, and the base error. Every other context builds on these terms.
- [eschema](./src/eschema/CONTEXT.md) — versioned, self-migrating schemas (schema evolution).
- [snapshot](./src/snapshot/CONTEXT.md) — semantic contract capture, inspection, comparison, and rendering for ESchemas and database tables.
- [db](./src/db/CONTEXT.md) — the single-table storage kernel shared by the database adapters.
  - [db/dynamodb](./src/db/dynamodb/CONTEXT.md) — DynamoDB adapter specifics.
  - [db/sqlite](./src/db/sqlite/CONTEXT.md) — SQLite adapter specifics.
  - [db/idb](./src/db/idb/CONTEXT.md) — in-browser IndexedDB adapter specifics.
  - [db/memory](./src/db/memory/CONTEXT.md) — ephemeral, runtime-independent Memory adapter specifics.
- [sync](./src/sync/CONTEXT.md) — the sync engine, its TanStack DB integration, strategies, and paced writes.

## Relationships

- **core** is the shared kernel for the whole toolkit. eschema, db (dynamodb/sqlite), and sync all speak its **Entity** / **Entity Meta** vocabulary.
- **eschema → core**: an **EncodedEntity** value carries eschema's `_v` **version** stamp; core's `EntitySchema` converts between encoded and decoded entity representations.
- **snapshot → eschema**: snapshot consumes ESchema structural introspection to produce **ESchema snapshots**; eschema does not depend on snapshot.
- **db → core, eschema**: the adapters persist core **Entities** whose `value` is validated by an eschema schema.
- **db → snapshot**: database tables provide topology and registered-entity source data to snapshot and expose `table.snapshot()` as their capture surface.
- **db (dynamodb ↔ sqlite ↔ idb ↔ memory)**: a **Shared Kernel**. The single-table topology — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **Table** — is defined once in [db](./src/db/CONTEXT.md); sqlite, idb, and memory mirror dynamodb's topology and each child context records only its divergences.
- **sync → core**: exposes **DecodedEntities** to application-facing integration points, decodes transport values at ingress, and interprets `_u` for convergence and `_s`/`_c` for cadence.
- **sync → db**: realizes its **Sync Store** through a compatible database adapter; Memory versus IndexedDB changes durability, not Peer Sync behavior.

## Term collisions (same word, different context)

- **Partition** — in [db](./src/db/CONTEXT.md) it is a physical single-table slice (an **item collection** sharing one **partition key**). In [sync](./src/sync/CONTEXT.md) it is a sync-lifecycle window (a refcounted `loadSubset` boundary). Unrelated concepts; each is correct inside its own context.
