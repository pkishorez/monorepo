---
title: Migration
order: 9
---

# Migration (`inspectMigration` / `migrationWriteIntent`)

Drift between stored rows and the current entity definition is surfaced
as a typed inspection — never raised as an error. The entity exposes
two operations that are the building blocks of
[`registry.migrate`](../../registry/migrate/index.doc.md):

| Method                          | Returns                              | Purpose                                                                     |
| ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `inspectMigration(rawItem)`     | `MigrationInspection`                | Classify the stored bytes without touching them.                            |
| `migrationWriteIntent(rawItem)` | `{ type: 'put', item } \| undefined` | Canonical row that would replace the stored bytes; `undefined` if no drift. |

## Inspection states

| State               | When                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------- |
| `valid`             | Re-encoding the decoded value yields bytes identical to the stored row.                 |
| `stale`             | Re-encode produces different bytes (data drift) or different GSI columns (index drift). |
| `corrupt`           | Decode failed, or `_u` is missing — the row cannot be canonicalised.                    |
| `ignored`           | The row's `_e` is not this entity (foreign tenant) — the migration skips it.            |
| `primaryKeyChanged` | Canonicalisation produced a different `pk` / `sk` — the row would have to be re-keyed.  |

`stale` carries flags `data: boolean` and `indexes: boolean` so the
caller can tell which kind of drift it is.

## Usage

```ts
const inspection = yield * UserEntity.inspectMigration(rawItem);
if (inspection.state.type === 'stale') {
  const intent = yield * UserEntity.migrationWriteIntent(rawItem);
  if (intent) {
    yield * table.putItem(intent.item);
  }
}
```

## Examples

### Reading drift reasons

```ts
const insp = yield * UserEntity.inspectMigration(row);
insp.reasons; // ['data-drift'] / ['index-drift'] / ['decode-failed'] / ...
```

## Edge cases

- **`_e` mismatch ⇒ `ignored`.** Multi-tenant rows survive a
  single-entity migration scan untouched.
- **Missing `_u` ⇒ `corrupt`.** Without a timestamp the library
  cannot canonicalise, so the row is flagged for hand-inspection.
- **Primary-key change ⇒ `primaryKeyChanged`.** The migration
  scanner does **not** rewrite the row automatically — moving a row
  to a new key is a manual operation.
- **`migrationWriteIntent` returns `undefined` for non-stale rows.**
  `valid`, `corrupt`, `ignored`, `primaryKeyChanged` all yield
  `undefined` — only `stale` is auto-rewritable.
- **Canonicalisation refreshes `_u` on rewrite.** When
  `migrationWriteIntent` produces a `put`, it uses
  `new Date().toISOString()` so every `_u`-keyed GSI advances and
  downstream subscribers see the migration.
- **`reasons` mirrors the drift kind.** `data-drift` /
  `index-drift` / `decode-failed` / `missing-_u` /
  `entity-mismatch` / `primary-key-changed` — strings, not enums,
  so a human can grep the migration report.

## Tests
