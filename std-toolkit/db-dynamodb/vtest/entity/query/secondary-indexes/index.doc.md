---
title: Secondary indexes
---

# Secondary indexes

A `DynamoEntity` maps each table-level GSI (`'GSI1'`, `'GSI2'`, ...)
to a **semantic** entity index name (`'byEmail'`, `'byStatus'`, ...)
with its own `pkDeps` and `skDeps`. The library writes the
`GSInPK`/`GSInSK` columns on every put/update so query payloads stay
declarative.

## Two flavours of secondary index

The shape of `query`/`queryStream`/`subscribe` for a secondary index
depends on a single bit: **is the SK the timeline cursor `_u`?**

| Variant         | `skDeps`                   | `params.sk` type                                  | Subscribable? |
| --------------- | -------------------------- | ------------------------------------------------- | ------------- |
| **Timeline SK** | `['_u']` (the default)     | `SkParam` — string cursor / `null` / `beginsWith` | ✅ yes        |
| **Custom SK**   | any tuple of entity fields | `CustomSkParam` — object with the SK fields       | ❌ no         |

`isTimelineSk` is a tagged bit on the stored derivation. The type
system uses it to pick the right `sk` shape per index.

## Usage

```ts
const UserEntity = DynamoEntity.make(table)
  .eschema(userSchema)
  .primary({ pk: ['id'] })
  // Timeline-SK GSI: sk auto-defaults to ['_u']
  .index('GSI1', 'byEmail', { pk: ['email'] })
  // Custom-SK GSI: explicit skDeps
  .index('GSI2', 'byStatus', { pk: ['status'], sk: ['priority', 'name'] })
  .build();

// Timeline-SK query: sk is a string cursor
yield * UserEntity.query('byEmail', { pk: { email: 'a@b.com' }, sk: null });

// Custom-SK query: sk is an object pinned to the SK fields
yield *
  UserEntity.query('byStatus', {
    pk: { status: 'active' },
    sk: { '>=': { priority: 1, name: 'A' } },
  });
```

## Examples

### Sparse index

If a row's `email` is undefined at write time, the library skips the
`GSI1PK` / `GSI1SK` columns — the row is not visible via `byEmail`
until the field is populated and the row is updated.

```ts
yield * UserEntity.insert({ id: '1', name: 'no-email-yet' });
// row is not indexed by email; query('byEmail') won't see it
```

### Subscribe restriction

`subscribe` only types-check against timeline-SK indexes — the
streaming model is "drain everything strictly after a `_u` cursor".

```ts
yield *
  UserEntity.subscribe({
    key: 'byEmail',
    pk: { email: 'a@b.com' },
    cursor: null,
  });
```

A `subscribe({ key: 'byStatus', ... })` call would not type-check.

## Edge cases

- **Default `skDeps` is `['_u']`.** Omit `sk:` from `.index(...)` and
  the library installs a timeline SK with `isTimelineSk: true`.
- **`isTimelineSk: true` ⇔ `skDeps === ['_u']`.** No other tuple
  qualifies — even `['createdAt']` is a custom SK.
- **GSI columns use the table-level GSI name.** The library writes
  `${gsiName}PK` / `${gsiName}SK` (e.g. `GSI1PK`, `GSI2SK`), not the
  semantic `entityIndexName`. The semantic name is for type-level
  routing only.
- **PK derivation prefixes with `<entity>#<entityIndexName>`.** The
  full PK string is `{Entity}#{indexName}#{pkValue}` so two entities
  can share the same GSI without colliding.
- **SK derivation prefixes with `<entity>` only.** SK has no
  `entityIndexName` prefix so a "natural" sort order across the
  whole entity is preserved.
- **Custom SK query takes an object, not a string.** The library
  derives the SK string from the object via `deriveIndexKeyValue`;
  the caller never spells out the joined string.
- **Sparse indexes:** a derivation key whose deps are partially
  undefined is **not written** — neither the PK nor the SK column
  appears on the row. The GSI silently skips that row.
- **`subscribe` is restricted to `_u`-SK indexes at the type level.**
  The generic parameter `K` is intersected with
  `SubscribableSecondaryKeys`, which only retains keys where
  `isTimelineSk` is true.
- **`queryStream` over a custom-SK GSI accepts an object cursor.**
  The initial `> / <` object is resolved to its derived string before
  the first request; subsequent pages re-derive from the last decoded
  value.

## Tests
