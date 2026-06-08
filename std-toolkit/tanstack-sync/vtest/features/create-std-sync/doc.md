# createStdSync

Everything in this package starts with one call. `createStdSync()` returns a
small object with four methods — the four sync shapes — plus an optional bag of
shared defaults.

```ts
const std = createStdSync();

std.totalSync({ schema, query }); // mirror a whole collection
std.onDemand({ schema, queries }); // load slices per partition value
std.singleItem({ schema, get }); // exactly one record
std.registry(); // fan broadcasts out by _e
```

## One instance, one shared tracker

The instance you get back is not stateless glue. Behind it sits a single
**tracker** that remembers which collections this instance created. That is what
lets `registry()` know where to route an inbound broadcast: it can only fan a
message out to collections born from the _same_ `createStdSync()` call. Mix two
instances and the registry of one will not see the collections of the other.

## Shared options defaults

Pass `options` to `createStdSync` and every collection it builds inherits them,
merged shallowly with (and overridden by) any per-collection `options`. This is
how you set one TanStack config — say a `gcTime` — once for a whole app instead
of repeating it on every collection.

```ts
const std = createStdSync({ options: { gcTime: 5000 } });
```

The factory itself does no I/O: calling `createStdSync` starts no sync and
touches no network. It only builds configuration, which keeps every shape fully
inspectable in a test without a running app.

::test-group{id=factory-surface}
