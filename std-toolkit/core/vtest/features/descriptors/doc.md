# Descriptors: how a backend describes a table

The storage packages — `db-sqlite`, `db-dynamodb` — each manage tables with
indexes. Tooling (migrations, introspection, the live viewer) wants to ask a
backend "what tables do you have, and how are their keys built?" without knowing
which backend it is. Core defines a backend-agnostic answer: the **descriptor**
types.

A `StdDescriptor` describes one table:

```ts
interface StdDescriptor {
  name: string; // entity / table name
  idField: string; // which field is the id
  version: string; // schema version
  primaryIndex: IndexDescriptor;
  secondaryIndexes: readonly IndexDescriptor[];
  schema: ESchemaDescriptor; // the value's JSON-schema-ish descriptor
}
```

Each index is an `IndexDescriptor` with a partition key (`pk`) and sort key
(`sk`), and each of those is an `IndexPatternDescriptor`: a `pattern` string
plus the `deps` (entity fields) it is built from.

```ts
interface IndexPatternDescriptor {
  deps: readonly string[]; // fields the key depends on
  pattern: string; // e.g. "Tenant#{tenantId}#User#{userId}"
}
```

The `pattern` makes the key construction _legible_ — you can read how a key is
assembled and which fields drive it, rather than reverse-engineering it from
data. Two more types tie a registry together: `DescriptorProvider` (a registry
that can hand back its whole `RegistrySchema`) and `DescriptorSource` (a single
entity that can hand back its own `StdDescriptor`). DynamoDB and SQLite both
implement these, which is why generic tooling can walk either.

These are TypeScript interfaces, so the example below builds a descriptor and
reads its parts back — the type checker is the validation.

::test-group{id=index-patterns}
