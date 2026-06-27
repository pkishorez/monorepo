# Context Map

std-toolkit is a cluster of bounded contexts. Each context owns its own ubiquitous language in a local `CONTEXT.md`. The same word may carry a different meaning in two contexts (e.g. **partition**) — that is intentional; each definition is scoped to its own context.

## Contexts

- [core](./src/core/CONTEXT.md) — the shared spine: the **Entity** model, **Entity Meta**, **Broadcaster**, and the base error. Every other context builds on these terms.
- [eschema](./src/eschema/CONTEXT.md) — versioned, self-migrating schemas (schema evolution).
- [db](./src/db/CONTEXT.md) — the single-table storage kernel shared by the database adapters.
  - [db/dynamodb](./src/db/dynamodb/CONTEXT.md) — DynamoDB adapter specifics.
  - [db/sqlite](./src/db/sqlite/CONTEXT.md) — SQLite adapter specifics.
- [tanstack-sync](./src/tanstack-sync/CONTEXT.md) — the TanStack DB sync engine, strategies, and paced writes.

## Relationships

- **core** is the shared kernel for the whole toolkit. eschema, db (dynamodb/sqlite), and tanstack-sync all speak its **Entity** / **Entity Meta** vocabulary.
- **eschema → core**: core's `_v` field is an eschema **version**; core's `EntitySchema` wraps an eschema schema.
- **db → core, eschema**: the adapters persist core **Entities** whose `value` is validated by an eschema schema.
- **db (dynamodb ↔ sqlite)**: a **Shared Kernel**. The single-table topology — **partition key**, **sort key**, **item collection**, `IndexDefinition`, `EntityRegistry` — is defined once in [db](./src/db/CONTEXT.md); sqlite mirrors dynamodb's topology and each child context records only its divergences.
- **tanstack-sync → core**: consumes core **Entities** from the wire; interprets `_u` for convergence and `_s`/`_c` for cadence.

## Term collisions (same word, different context)

- **Partition** — in [db](./src/db/CONTEXT.md) it is a physical single-table slice (an **item collection** sharing one **partition key**). In [tanstack-sync](./src/tanstack-sync/CONTEXT.md) it is a sync-lifecycle window (a refcounted `loadSubset` boundary). Unrelated concepts; each is correct inside its own context.
