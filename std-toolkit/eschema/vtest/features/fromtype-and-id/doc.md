# Two small helpers: `fromType` and `id`

eschema ships two tiny helpers that smooth over the gap between "the shape your
code already has" and "a schema". They do nothing clever — they just save you
boilerplate at the two most common friction points.

## `fromType<T>()` — a schema for a type you already own

Sometimes you already have a TypeScript type and don't want to redescribe it
field-by-field as a runtime schema — you trust the data and just want the type
to flow. `fromType<T>()` gives you a pass-through codec typed as `T`:

```ts
type Money = { amount: number; currency: string };

const Wallet = ESchema.make({
  owner: Schema.String,
  balance: fromType<Money>(),
}).build();
```

`balance` now carries the `Money` type through encode and decode without
re-deriving validation for it.

## `id(identifier)` — a named string field

`id('UserId')` is just `Schema.String` annotated with an identifier. The
annotation gives the field a stable name in generated JSON Schema / OpenAPI
descriptors, so a `userId` reads as `UserId` rather than an anonymous string.

```ts
const Account = ESchema.make({
  userId: id('UserId'),
  label: Schema.String,
}).build();
```

::test-group{id=helpers}
