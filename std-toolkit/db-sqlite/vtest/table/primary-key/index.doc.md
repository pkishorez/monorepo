---
title: table.primary-key
order: 2
---

# table.primary-key

Every row in a `SQLiteTable` is keyed by a **composite `(pk, sk)`
primary key**. The names of the two columns are configurable; the
shape — two columns, both `TEXT` — is not.

## Usage

```ts
const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .build();
```

## API

| Member       | Type                                  | Meaning                                 |
| ------------ | ------------------------------------- | --------------------------------------- |
| `.primary()` | `(pk: string, sk: string)`            | Configures the composite primary key.   |
| `primary`    | `{ pk: string; sk: string }`          | The resolved column names on the table. |
| `getItem`    | `(key: { pk, sk }) => Effect`         | Read one row by exact primary key.      |
| `updateItem` | `(key: { pk, sk }, values) => Effect` | Update one row by exact primary key.    |
| `deleteItem` | `(key: { pk, sk }) => Effect`         | **Soft** delete by exact primary key.   |

## Examples

### Choosing your own column names

```ts
SQLiteTable.make({ tableName: 't' }).primary('partition', 'sort').build();
```

The strings become the actual SQLite column names. Pick something
your introspection / admin tooling is comfortable with — the rest of
the library doesn't care.

## Edge cases

- **`primary()` requires both column names.** There is no default.
- **Column names are propagated verbatim, not normalised.** The
  strings you pass become the SQLite column names.
- **`getItem` / `updateItem` / `deleteItem` all take `{ pk, sk }`.**
  Item-level operations only key by the composite — there is no other
  way to address a row at the table level.
- **`deleteItem` on the table is a SOFT delete.** It updates `_d = 1`
  rather than issuing `DELETE`. Hard removal is
  `dangerouslyRemoveAllRows('i know what i am doing')`.

## Tests

Tests live alongside this doc and assert the builder shape, not live
SQLite behaviour.
