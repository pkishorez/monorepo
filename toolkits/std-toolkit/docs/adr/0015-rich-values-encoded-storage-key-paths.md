---
status: accepted
supersedes: ADR-0014
---

# Rich values in code, encoded form at every boundary, keys as key paths

ESchema fields may now convert between a rich **value** and its **encoded form**, for example `Schema.DateFromString`: code holds a `Date`, storage and the wire hold an ISO string. Application code only ever handles values. Every boundary converts through the schema it already uses, so users never build, read, or type an encoded form: StdTable encodes on write and decodes on read, an RPC contract uses `EntitySchema(X)` for Entities and `X.schema` for written values and Effect RPC converts on both ends, and Sync Collections, Mutation Callbacks and sources hold values while the Sync Store, Peer Sync and the Outbox hold the encoded form. The one Entity shape and `_v` in Entity Meta from ADR 0014 are unchanged.

Versioning belongs to the encoded form. A **table snapshot** captures only encoded shapes, so swapping `Schema.String` for `Schema.DateFromString` over the same stored string needs no new version, provided every existing stored value already parses; how a field converts is not versioned, so a field must never change meaning without changing its name or encoded shape. **Migrations** work on values: decoding converts a row with its own version's fields and then migrates value to value, and only the latest value is ever encoded. Any Effect conversion whose encoded side a snapshot can capture is allowed in `ESchema`, `EntityESchema`, `ValueESchema` and nested ESchemas alike; filters and constructor defaults stay refused.

Keys are **key paths**: dotted paths into the value (`boardId`, `owner.userId`) that end at a string or number. They go through struct fields, nullable steps, nested ESchemas and union branches, never through arrays or records, and the types offer every valid path for autocompletion. A primary key path must exist, non-null, in every union branch; a secondary index path may exist in only some branches, which makes the index sparse. Queries name the same paths (`{ pk: { 'owner.userId': 'u1' } }`), so top-level keys look as they did before. Numbers are stored in an order-preserving string form and query operands are converted the same way. Keys are derived from the value, not the encoded form, so a field's conversion never affects a key and a converted field such as a `Date` cannot be a key part. Sync partition keys are key paths too, ending in a string, number or boolean, and must exist in every branch.

The DynamoDB native API, including expression updates, is removed. It was written against stored attributes, so with conversions it would be the one place users handle the encoded form. Every write goes through `insert`, `update` or `getAndUpdate`, which read, merge and encode the whole value.

## Considered Options

- **Keep ADR 0014: value and encoded form share one shape, conversions refused.** Simple, but it pushed every `Date` or `BigInt` conversion into application code after every read and before every write, which is exactly the boundary work the toolkit exists to hide. ADR 0014's objections to a richer form — two-way conversion in keys, query operands and RPC contracts — are met here: keys read values through key paths, RPC converts through the contract schema, and the snapshot still freezes only the encoded form.
- **Migrations on the encoded form, converting only at the latest version.** Keeps migrations on plain data, but makes users write migrations in a form they otherwise never see.
- **Converting key fields automatically (a `Date` field as a key, stored as its ISO string).** Range order would follow the encoded string, which is wrong for conversions such as numbers stored as strings, and would need a list of order-safe conversions. Key paths that must end at a string or number give the user the string and its order directly.
- **Key functions `(value) => string`.** The snapshot cannot see inside a function, so a changed primary key would pass the snapshot guard and make every existing row unreachable. A hand-maintained label relies on users remembering to bump it; checking sample rows stored in the snapshot catches most changes but not all. A sync partition function could never be triggered by a TanStack query filter.
- **Keeping the DynamoDB native API as an escape hatch.** Rejected because it requires writing encoded attributes by hand.

## Consequences

Studio's generic RPC cannot know application types, so it shows encoded values, including the order-preserving strings of number key parts. Places that compared values with `===`, such as detecting a changed primary key on update and `subscribe` filters, must compare derived keys or encoded values so that two equal `Date`s count as equal.
