# Secondary indexes

The primary key gives you one way in: by id within a partition. Real apps need
more — _users by email_, _orders by status_. Rather than scan, you **declare**
those access patterns as **global secondary indexes** (GSIs) up front.

## Reserving a GSI on the table, mapping it on the entity

The table reserves generic index columns; the entity gives them meaning:

```ts
const table = DynamoTable.make(config)
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK') // a spare index slot
  .build();

const users = DynamoEntity.make(table)
  .eschema(UserSchema)
  .primary()
  .index('GSI1', 'byEmail', { pk: ['email'] }) // sk defaults to _u
  .build();
```

`byEmail` is the _semantic_ name you'll query by; `GSI1` is the physical slot.
The partition key is derived from `email`. The sort key defaults to `_u` — the
update key — which makes the index a **timeline**: items come back newest-or-
oldest by write order, perfect for "the latest N". `getTableSchema()` already
includes the GSI, so provisioning the table wires the index automatically.

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
`email` automatically moves the item to the new index partition — query the old
email and it's gone, query the new one and it's there. You never maintain the
index by hand.

::test-group{id=alternate-access}
