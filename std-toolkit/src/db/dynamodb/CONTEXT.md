# db/dynamodb — Ubiquitous Language

The DynamoDB adapter. Inherits the single-table topology — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **Table**, **Entity service** — from [[db]]. This glossary defines only the DynamoDB-specific vocabulary. See the root `CONTEXT-MAP.md`.

## Language

**DynamoDB client**:
The table-independent, type-safe request interface to the complete DynamoDB API. It knows how to reach DynamoDB but has no `DynamoTable`, **Table binding**, **Entity service**, or ESchema semantics.
_Avoid_: Table client.

**DynamoTable**:
A type-safe **Table** definition with a logical name, a **primary index**, and optional secondary indexes. Its logical name identifies the definition but is not the physical DynamoDB table name.

**Table binding**:
The runtime association between a `DynamoTable`, the physical DynamoDB table that implements it, and the client that reaches it. One DynamoDB runtime can resolve bindings for multiple tables, but each `DynamoTable` has exactly one binding in that runtime.
_Avoid_: Table client, table connection.

**DynamoEntity** / **DynamoSingleEntity**:
The DynamoDB **Entity service**s (keyed / singleton) for CRUD over a `DynamoTable`.

**Primary index** / **GSI**:
The main table index (its **partition key** + **sort key**), versus a **Global Secondary Index** — an alternative index with its own independent pk/sk for queries the primary can't serve.
_Avoid_: LSI naming unless an actual local secondary index is meant.

**IndexDerivation**:
The rules mapping an entity's fields onto **partition key** + **sort key** values for a given index.
_Avoid_: key mapping, key builder.

**Expression** (`exprCondition` / `exprFilter` / `exprUpdate`):
The type-safe builders for DynamoDB expressions — a **condition** (predicate for conditional writes), a **filter** (post-query predicate on results), and an **update** (SET / REMOVE / ADD / APPEND spec). `buildExpr` / `keyConditionExpr` compile them to DynamoDB expression strings and attribute maps.
_Avoid_: query builder (these are expression builders).

**opAdd** / **opIfNotExists**:
Update operators — arithmetic add on a numeric attribute, and conditional SET that writes only when the attribute is absent.

**ValidPaths**:
Type-safe dot/bracket paths into an entity (e.g. `user.email`, `tags[0]`) used by expressions.

**marshall** / **unmarshall**:
Conversion between JS values and DynamoDB `AttributeValue` format.
_Avoid_: serialize/deserialize (reserve those for eschema encode/decode).

**Auto-migration**:
On read, stale items are folded to the latest eschema [[eschema]] **version** automatically; on update, a stale item is rewritten in canonical latest-version form before the update retries.

**DynamoDBError**:
The direct union of tagged adapter failures (`GetItemFailed`, `PutItemFailed`, `ConditionCheckFailed`, …). When a variant maps another failure, it retains the complete original error in `cause`, whose type follows that variant.
_Avoid_: DynamodbError.

## Composition

The dependency direction is `entrypoint → orchestrators → services → clients → domain`. Orchestrators and services may also use core, ESchema, and snapshots. Domain code is pure and never performs requests, reads Effect services, or broadcasts changes.

`DynamoDB.layer` owns binding composition. Tables do not expose `bind()`, and binding never mutates a table. Resolution uses table object identity; the logical name is for diagnostics and snapshots. Supplying the same table object twice is an immediate `DuplicateTableBinding`. Resolving an unbound table fails with `TableBindingNotFound`.

## TODO

- Encode binary `AttributeValue` inputs (`B` and `BS`) supplied as `Uint8Array` into Base64 strings before serializing DynamoDB JSON requests.
