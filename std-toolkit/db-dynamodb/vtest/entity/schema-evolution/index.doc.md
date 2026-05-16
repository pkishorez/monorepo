---
title: Schema evolution
order: 10
---

# Schema evolution

ESchemas evolve by version. Calling `.evolve(name, transform, schema)`
on an `EntityESchema` registers a new version; the latest version is
written by every new put/update, and reads of older versions are
transformed up to the latest shape on the fly.

## Usage

```ts
const userV1 = EntityESchema.make('User', 'id', {
  email: Schema.String,
  name: Schema.String,
}).build();

const userV2 = userV1
  .evolve(
    'v2',
    (old) => ({ ...old, displayName: old.name }),
    Schema.Struct({
      email: Schema.String,
      name: Schema.String,
      displayName: Schema.String,
    }),
  )
  .build();
```

## Examples

### Reading an old row

```ts
// Stored row: { _v: 'v1', email: 'a@b.com', name: 'A', ... }
const { value } = yield * UserEntity.get({ id: '1' });
value.displayName; // 'A' — synthesised by the v1→v2 transform
```

### Writing always uses the latest

```ts
yield *
  UserEntity.insert({
    id: '2',
    email: 'b@c.com',
    name: 'B',
    displayName: 'B',
  });
// Stored row carries _v: 'v2'
```

## Edge cases

- **Writes always stamp `_v` at the latest version.** The library
  reads `eschema.latestVersion` at write time; the caller cannot pin
  to an older version.
- **Reads transform up the version chain.** A row with `_v: 'v1'`
  passes through every registered transform up to the latest schema
  before it lands in `value`.
- **Decode of an unknown `_v` is `corrupt`.** If the stored `_v` is
  not in the registry,
  [`inspectMigration`](../migration/index.doc.md) reports `corrupt /
decode-failed`. The runtime `get` surfaces this as
  `DynamodbError.getItemFailed`.
- **An update locks on `_v`.** Every update AND-s `_v = latest` onto
  the condition. A row at an older `_v` cannot be updated until it
  has been migrated.
- **Evolutions are forward-only.** There is no down-migration; old
  clients reading new data is out of scope (and the on-the-wire
  contract is "latest version always wins").
- **Adding a field with a default is a `data-drift` migration.** An
  existing row's canonical re-encode differs from the stored bytes,
  so [`migrate`](../../registry/migrate/index.doc.md) flags it as
  `stale / data: true`.

## Tests
