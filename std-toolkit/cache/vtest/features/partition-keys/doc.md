# Partition keys

One last concept rounds out the model. Inside a single backend you often want to
keep otherwise-identical records apart — the same `User` collection, but
partitioned per tenant, per workspace, or per locale. A _partition key_ is how
you label a slice of storage, and `serializePartition` is the helper that turns
that label into a stable string.

## A stable, order-independent string

A partition is just a `Record<string, string>` of dimensions:

```ts
serializePartition({ tenant: 'acme', region: 'eu' });
// "region:eu#tenant:acme"
```

Two properties make this safe to use as a storage key:

1. **Order-independent.** Keys are sorted before joining, so
   `{ tenant: 'acme', region: 'eu' }` and `{ region: 'eu', tenant: 'acme' }`
   serialize to the _same_ string. The same logical partition always lands in
   the same place, no matter how you wrote the object.

2. **Empty is empty.** No partition (or an empty object) serializes to `""` —
   the unpartitioned default. There's no special-casing at the call site.

::test-group{id=serialize}
