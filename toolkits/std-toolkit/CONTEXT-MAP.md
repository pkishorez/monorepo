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
- **eschema → core**: an **Entity**'s meta carries eschema's `_v` **version**; core's `EntitySchema` migrates an Entity's value to the latest version.
- **snapshot → eschema**: snapshot consumes ESchema's public introspection, including eschema's **snapshot type** description of each version's encoded side, to describe every schema a table reaches, and the table snapshot document is itself an ESchema so a stored document migrates forward like any row; eschema does not depend on snapshot.
- **db → core, eschema**: the adapters persist core **Entities** whose `value` is validated by an eschema schema.
- **snapshot reads db structurally**: `TableSnapshot.capture` reads a table's topology and registered entities through a structural type, so neither db nor snapshot imports the other. No adapter and no layer runs snapshot; removing snapshot leaves the runtime compiling. The per-table Vitest test lives in snapshot and never touches a database.
- **alchemy → db, snapshot**: `std-toolkit/alchemy` is the only place snapshot meets a deploy. Each target makes a table exist, and its **snapshot guard** keeps the accepted table snapshot in Alchemy state and refuses a deploy that is not upgradable. Nothing depends on alchemy.
- **db (dynamodb ↔ sqlite ↔ idb ↔ memory)**: a **Shared Kernel**. The single-table topology — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **Table** — is defined once in [db](./src/db/CONTEXT.md); sqlite, idb, and memory mirror dynamodb's topology and each child context records only its divergences.
- **sync → core**: accepts [[core]] **Entities**, ignores an Entity from a newer version as an **Outdated Application**, exposes their latest values in Collections and to Mutation Callbacks, and interprets `_u` for convergence and `_s`/`_c` for cadence.
- **sync → db**: realizes its **Sync Store** through a compatible database adapter; Memory versus IndexedDB changes durability, not Peer Sync behavior.

## Term collisions (same word, different context)

- **Partition** — in [db](./src/db/CONTEXT.md) it is a physical single-table slice (an **item collection** sharing one **partition key**). In [sync](./src/sync/CONTEXT.md) it is a sync-lifecycle window (a refcounted `loadSubset` boundary). Unrelated concepts; each is correct inside its own context.
