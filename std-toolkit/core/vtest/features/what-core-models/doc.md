# What core models: the envelope

`eschema` answers "what shape is this value, and how does it change over time?"
But a value almost never sits in storage by itself. The toolkit needs to know,
for every stored record, a few things the value itself doesn't carry: which
schema version it was written under, what kind of entity it is, whether it has
been soft-deleted, and when it last changed.

Core's whole job is to standardize that wrapper. A stored record is a **value
plus meta** envelope:

```ts
type EntityType<T> = {
  value: T; // your domain shape
  meta: { _v: string; _e: string; _d: boolean; _u: string };
};
```

`value` is yours; `meta` is the toolkit's. Keeping them in separate slots is the
key decision — your domain fields can be named anything without ever colliding
with the bookkeeping, because the bookkeeping lives under its own `meta` key.

Every storage package in the toolkit stores this exact shape, which is why core
sits at the bottom of the dependency graph: it is the contract they all agree
on.

The runtime expression of this contract is `MetaSchema`, an Effect `Schema` for
the `meta` half of the envelope. The next feature looks at its four keys; here we
just confirm a well-formed envelope's meta validates and a malformed one is
rejected.

::test-group{id=envelope-shape}
