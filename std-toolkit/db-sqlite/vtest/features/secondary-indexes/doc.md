# Secondary indexes

The primary key gives you one way in: by id within a partition. Real apps need
more — _users by email_, _posts by author over time_. Rather than scan, you
**declare** those access patterns as secondary indexes up front.

## Reserving an index on the table, mapping it on the entity

The table reserves generic index columns; the entity gives them meaning:

```ts
const table = SQLiteTable.make({ tableName: 'std_data' })
  .primary('pk', 'sk')
  .index('IDX1', 'IDX1PK', 'IDX1SK') // a spare index slot
  .build();

const users = SQLiteEntity.make(table)
  .eschema(UserSchema)
  .primary()
  .index('IDX1', 'byEmail', { pk: ['email'] }) // sk defaults to _u
  .build();
```

`byEmail` is the _semantic_ name you'll query by; `IDX1` is the physical slot.
The partition key is derived from `email`. The sort key defaults to `_u` — the
update key — which makes the index a **timeline**: records come back newest-or-
oldest by write order, perfect for "the latest N".

## Querying an index, and why update keeps it correct

You query a secondary index exactly like the primary one, just by its name:

```ts
yield *
  users.query('byEmail', {
    pk: { email: 'ada@example.com' },
    sk: { '>=': null },
  });
```

Because the index column is derived from the value, an `update` that changes
`email` automatically moves the record to the new index partition — query the old
email and it's gone, query the new one and it's there. You never maintain the
index by hand.

::test-group{id=alternate-access}
