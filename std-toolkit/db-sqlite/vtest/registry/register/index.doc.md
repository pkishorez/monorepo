---
title: registry.register
order: 1
---

# registry.register

Accumulate a typed map of entities on the shared `SQLiteTable`. The
builder is append-only: `.register(entity)` /
`.registerSingle(entity)` widen the inferred map, and `.build()`
produces the immutable `EntityRegistry` instance.

## Usage

```ts
const registry = EntityRegistry.make(table)
  .register(UserEntity)
  .register(PostEntity)
  .registerSingle(AppConfig)
  .build();

registry.entity('User'); // typed as UserEntity
registry.singleEntity('AppConfig'); // typed as the AppConfig single-entity
```

## API

| Member                     | Type                                           | Meaning                            |
| -------------------------- | ---------------------------------------------- | ---------------------------------- |
| `EntityRegistry.make(t)`   | builder                                        | Start a builder for table `t`.     |
| `.register(entity)`        | builder                                        | Add a regular entity.              |
| `.registerSingle(entity)`  | builder                                        | Add a single entity.               |
| `.build()`                 | `EntityRegistry`                               | Freeze the map.                    |
| `registry.entity(name)`    | `TEntities[name]`                              | Typed lookup.                      |
| `registry.singleEntity(n)` | `TSingleEntities[n]`                           | Typed lookup.                      |
| `registry.entityNames`     | `(keyof TEntities \| keyof TSingleEntities)[]` | Union of all registered names.     |
| `registry.setup()`         | `Effect.Effect<void, SqliteDBError, SqliteDB>` | Delegates to the shared table.     |
| `registry.getSchema()`     | `RegistrySchema`                               | One descriptor per regular entity. |

## Edge cases

- **Entity name is taken from `schema.name`, not a separate
  argument.** You cannot register the same entity under a different
  name; the schema owns the key.
- **`register` / `registerSingle` widen the inferred map types.**
  Each builder step adds the entity's name to the type-level map.
- **`entityNames` lists regular + single entities together.** Useful
  for the command processor's "exists?" check.
- **`setup()` delegates to the shared table.** The registry does not
  own DDL; it forwards to `SQLiteTable.setup()`.
- **`getSchema().descriptors` contains one entry per _regular_
  entity.** Single entities have no index map to expose.

## Tests

Tests live alongside this doc.
