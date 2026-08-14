# db/dynamodb — Ubiquitous Language

The DynamoDB adapter. Inherits the single-table topology — **partition key**, **sort key**, **item collection**, `IndexDefinition`, **StdTable**, **entity surface** — from [[db]]. This glossary defines only the DynamoDB-specific vocabulary. See the root `CONTEXT-MAP.md`.

## Language

**DynamoDB client**:
The table-independent, type-safe request interface to the complete DynamoDB API. It knows how to reach DynamoDB but has no **StdTable**, adapter table, **entity surface**, or ESchema semantics.
_Avoid_: Table client.

**DynamoDB adapter table**:
The result of `DynamoDB.make` (`DynamoDBTable`): a StdTable layer, explicit setup Effect, physical table name, and DynamoDB-native service. The physical name never defaults from the StdTable's logical name.
_Avoid_: Configured DynamoDB Table (retired term), binding, Table client.

**DynamoDB table definition**:
The pure AWS `CreateTableInput` topology derived from a shared [[db]] **StdTable**, excluding client configuration and the physical table name. Infrastructure code can obtain it without a configured **DynamoDB adapter table**.
_Avoid_: Setup result, bound table definition.

**DynamoDB item**:
The adapter's **decoded item**: the physical representation of an **encoded item**. The configured primary and secondary key attributes, `_e`, `_v`, `_u`, `_d`, and `data` are top-level DynamoDB attributes. `data` is a map containing the encoded Entity value. Secondary attributes retain the exact names declared by `IndexDefinition`.

**DynamoDB item schema**:
The adapter's **item schema**: one table-parameterized two-way Effect Schema between an **encoded item** and a **DynamoDB item** (`itemSchema(table): Schema<DecodedItem, EncodedItem>`). Writes run the decode direction, reads the encode direction, and malformed items fail as parse errors. It performs no I/O.
_Avoid_: item codec, encodeItem/decodeItem pairs.

**Create-only setup**:
The setup operation creates the physical table from the declared topology. If the table already exists, setup fails with the DynamoDB `CreateTable` failure. It does not inspect, reconcile, or update an existing table.

**DynamoDB-native service**:
The Table-scoped requirement for expression updates and batch writes. Portable Entity operations do not depend on it.

**Primary index**:
The main table index, defined by its **partition key** and **sort key**. Secondary indexes use the shared [[db]] **LSI** / **GSI** vocabulary.

**DynamoDB read consistency**:
Primary-index and LSI reads can be strongly consistent; GSI reads are always eventually consistent. This is a DynamoDB adapter constraint, not a guarantee of the shared [[db]] **StdTable surface**.

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

**DynamoDBNativeError**:
The error for DynamoDB-only setup, consistent reads, expression updates, and batch writes. It names the native operation and retains the original client failure in `cause`. Portable operations fail with [[db]] `DatabaseError`.

## Composition

The dependency direction is `door → table/native/setup → client + domain (attribute-value, expression, item-schema)`; `domain/` is pure. Portable operations depend only on the shared **StdTable contract**.

`DynamoDB.make(stdTable, config)` owns client construction and exposes the adapter table's layer and setup operation. Callers supply an adapter config, not a constructed client. Config never mutates a StdTable; StdTable requirements use the logical name at the Effect boundary.

## TODO

- Encode binary `AttributeValue` inputs (`B` and `BS`) supplied as `Uint8Array` into Base64 strings before serializing DynamoDB JSON requests.
