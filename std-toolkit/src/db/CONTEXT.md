# db — Ubiquitous Language

The storage kernel shared by the database adapters. db is the **Shared Kernel** between [[dynamodb]] and [[sqlite]]: it defines the single-table topology both adapters implement. SQLite mirrors DynamoDB's topology, so the vocabulary is defined once here; each child context (dynamodb, sqlite) records only its own divergences. Adapters persist core [[core]] **Entities** whose `value` is validated by an eschema [[eschema]] schema. See the root `CONTEXT-MAP.md`.

## Language

**Single-table design**:
The pattern of storing many entity types in one physical table, distinguished by key structure rather than separate tables.
_Avoid_: multi-table, one-table-per-entity.

**Partition key (pk)**:
The distribution key. All rows sharing a pk value live together as one **item collection**.
_Avoid_: hash key (within this context use **partition key**). Note: unrelated to tanstack-sync's **Partition** lifecycle concept — see the root map's collision note.

**Item collection**:
The set of rows sharing one **partition key** value — i.e. a single **partition** in the storage sense. The unit a query over a pk returns.
_Avoid_: partition (prefer **item collection** when naming the row set; reserve "partition" for the concept).

**Sort key (sk)**:
The ordering key within an **item collection**. Enables range queries (`<`, `<=`, `>`, `>=`, `=`, `between`, `beginsWith`) over a partition.
_Avoid_: range key (within this context use **sort key**).

**IndexDefinition**:
The structure naming the pk and sk attributes/columns for an index.

**EntityRegistry**:
The manager coordinating multiple entity types stored in one single-table — routes operations to the right entity by its type.
_Avoid_: EntityManager, store registry.

**Entity service**:
The per-entity CRUD surface over the table — `DynamoEntity` / `SQLiteEntity` for keyed entities, `DynamoSingleEntity` / `SQLiteSingleEntity` for singletons. Each adapter names its own pair.

**QueryResult**:
The output of a query/scan over an **item collection** — the returned `Items`, plus adapter-specific pagination (e.g. DynamoDB's `LastEvaluatedKey`).
