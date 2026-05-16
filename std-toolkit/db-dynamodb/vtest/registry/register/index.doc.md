---
title: registry.register
order: 1
---

# registry.register / registerSingle / build

Builder steps for declaring which entities live in this registry. Each
call produces a _new_ builder whose type carries the registered entity
name, so `registry.entity('User')` is type-safe and missing entries
fail at compile time.

## Usage

```ts
const registry = EntityRegistry.make(table)
  .register(UserEntity)
  .register(OrderEntity)
  .registerSingle(AppConfig)
  .build();

registry.entity('User'); // typed as UserEntity
registry.singleEntity('AppConfig'); // typed as AppConfig
```

## API

| Builder method   | Adds to                                   | Notes                                                                 |
| ---------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `register`       | `TEntities`                               | Reads `entity.name` from the schema; the key in the map is that name. |
| `registerSingle` | `TSingleEntities`                         | Same — keyed by `singleEntity.name`.                                  |
| `build`          | Constructs the immutable `EntityRegistry` | Erases the builder state.                                             |

## Edge cases

- **Entity name is the map key.** Two entities cannot share a name —
  the latter `.register(...)` call would overwrite the first at the
  type level and at runtime. Names come from the ESchema and are
  meant to be globally unique within a table.
- **Single entities are kept in a separate map.** Regular and single
  entities never collide at the type level, but their names should
  still be distinct since `entityNames` flattens them.
- **`build()` is mandatory.** The builder type and the registry type
  are different — only the registry has `transact` / `migrate` /
  `entity`.
- **Order of registration does not matter for behaviour.** It only
  affects the order of `entityNames` and the order of descriptors
  returned by `getSchema`.

## Tests
