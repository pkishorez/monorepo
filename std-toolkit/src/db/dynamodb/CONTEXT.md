# db/dynamodb — Ubiquitous Language

The DynamoDB adapter. Inherits the single-table topology — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **Table**, **Entity service** — from [[db]]. This glossary defines only the DynamoDB-specific vocabulary. See the root `CONTEXT-MAP.md`.

## Language

**DynamoTable**:
A type-safe table definition with a **primary index** and optional secondary indexes.

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

**DynamodbError**:
The unified adapter error (`GetItemFailed`, `PutItemFailed`, `ConditionCheckFailed`, …), extending core's [[core]] **StdToolkitError**.
