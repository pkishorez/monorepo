# Composition via `toSchema`

Real data is nested. An evolving schema can be embedded as a field of another
evolving schema using `toSchema`, which turns it into a native Effect Schema you
can drop anywhere a schema is expected — including inside `Schema.Array`.

## Each child versions independently

The key idea: each nested schema decodes through its **own** version chain,
independently of the parent. The parent carries its `_v`; each child carries its
own. They version separately, and an array of children may even hold elements
stamped at different versions.

```ts
const Address = ESchema.make({
  street: Schema.String,
  city: Schema.String,
}).build();

const Status = ValueESchema.make(Schema.Literals(['draft', 'published']))
  .evolve('v2', Schema.Literals(['draft', 'review', 'published']), (v) => v)
  .build();

const Ticket = ESchema.make({
  title: Schema.String,
  status: toSchema(Status, { name: 'Status' }),
  addresses: Schema.Array(toSchema(Address, { name: 'Address' })),
}).build();
```

When you encode a `Ticket`, every level gets its own `_v`: the parent ticket,
the value envelope for `status`, and each address in the array. On decode, every
level folds forward through its own chain.

`toSchema` needs a name for the schema it produces (it drives the descriptor's
`$defs` key). Named constructs like `SingleEntityESchema`/`EntityESchema` supply
one; for an anonymous `ESchema`/`ValueESchema`, pass `{ name: '…' }`.

::test-group{id=nesting}
