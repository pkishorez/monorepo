# Sync guide

Detailed behaviour of `std-toolkit/sync`. The README covers setup and the
common shapes; this page covers the rules you need once a Collection is live.
Vocabulary is in [src/sync/CONTEXT.md](../src/sync/CONTEXT.md). Decisions are
in [src/sync/docs/adr/](../src/sync/docs/adr/).

## Instance options

`createStdSync({ name, platform, version, runtime, outbox, options })`.

- `name` is normalized and qualifies every Collection Name. All tabs connected
  to the same Backend dataset must use the same stable name. The qualified
  Collection Name identifies its Sync Store namespace and its one Peer
  Channel; the schema's own name remains the Entity `_e` identity.
- `platform` names the environment. Absent, the instance is a solo
  participant: an isolated Memory Sync Store, no Leadership, no Peer Sync.
  `browser()` from `std-toolkit/sync/platform/browser` is the shared-origin
  preset: an IndexedDB Sync Store (database `std-sync` unless `databaseName`
  overrides it), Web Locks Leadership, and Peer Sync over `BroadcastChannel`.
  A platform is a plain value and may be shared by several instances.
- `version` (string or number) stamps the Sync Store. When an instance boots
  with a different version than the stored one, including no stored version,
  it empties the whole Sync Store for every namespace sharing that store
  before serving anything, then records the new version. Bump it when the
  Backend is wiped or reshaped. Leave it unset and nothing is ever cleared.
- `runtime` is a `ManagedRuntime` (or any object with `runSync`,
  `runPromise`, and `contextEffect`). Sync runs user Effects through it at
  TanStack's imperative boundaries. Without it, Sync falls back to
  `Effect.runSync` and `Effect.runPromise`. The runtime environment is
  inferred across strategies, fetches, and mutation callbacks; a required
  service missing from the runtime is a type error.

Use `std.collection(config)` to let Sync create the TanStack Collection, or
`createCollection(std.sync(config))`. Call `await std.dispose()` when the
instance is no longer needed.

## Sources and the cursor rule

Every strategy reads through a source builder: `paginated`, `poll`, and
`live` for partitioned strategies; `once`, `poll`, and `subscribe` for single
items.

`cursor` is exclusive. Given a cursor, return entities strictly beyond it,
never the cursor entity itself. `paginated` pages until `fetch` returns an
empty batch, so an inclusive backend would re-serve the boundary entity
forever. Sync stops paging when the cursor stops advancing, but the last page
is then fetched twice. Filter with `<` / `>`, not `<=` / `>=`. `cursor` is
`null` on the first fetch and means "start from the end".

The removed `subscribeOlder` / `subscribeNewer` config resumed from and
including the cursor. Tighten the comparison when porting to `paginated`.

## Total, partition, and hybrid sync

Total sync eventually loads the complete entity set. A partition factory is
activated by a matching TanStack query; its parameter is inferred from the
schema field, and only string, number, and boolean fields may be partition
keys. Total and partition workers can run together. They keep separate
progress but write through the same Sync Replica, so overlap is deduplicated
by entity id and `_u` convergence.

## Cadence repair

Repair is independent from the strategy and owns its own source. Declaring
`repair` without `cadence` inherits the instance default; omitting `repair`
disables it even when a default exists.

```ts
postId: (postId) => {
  const fetchForward = ({ cursor }) => api.getComments({ postId, cursor });
  return {
    strategy: syncStrategy.oldToNew({
      source: ({ paginated }) => paginated({ fetch: fetchForward }),
    }),
    repair: {
      fetchFrom: fetchForward,
      cadence: { window: 5_000, readiness: 10_000, pollDelay: 2_000 },
    },
  };
};
```

## Events

`onEvent` receives structured Events for lifecycle failures, initialization
failures, unserved queries, Registry Broadcast delivery, and Peer Sync phases.
Peer Sync reports `channel-creation`, `subscription`, `send`, `decode`,
`receive`, and `cleanup` failures without failing sync or mutation work. When
omitted, Events go to Effect's logger.

## Flow tracing

Every Collection owns one Effect Tracer Flow with an id shaped as
`<qualified-collection-name>::<ulid>`. The Flow stays active across
Collection starts, cleanup, and restarts; Sync never ends it. Effect telemetry
configuration decides whether it is exported.

The Flow has a `collection` lane, one global worker lane, one stable lane per
logical Partition, a lane per Cadence Repair worker, and one worker lane for
Single Item Sync. Hydration is two activities on the collection lane, `Load
Sync Replica` then `Project into Collection`, each carrying its row count;
`Collection ready` closes it. Every supervised strategy run is a `Sync
session` activity numbered per retry. The built-in strategies record each
delivered batch as a child activity (`Receive batch`, `Backfill batch`, `Tail
batch`). Every non-empty delivery logs how many entities were received and how
many the Sync Replica accepted after convergence.

Every participant with a real lifecycle records an Activation: the collection
lane from `sync(callbacks)` to cleanup, each strategy for its supervised run,
each partition for one `0 -> 1 -> 0` subscribe cycle. A lane can be activated
many times but never twice at once.

Custom strategies add activities and events through `ctx.flow`:

```ts
run: (ctx) =>
  api.fetchPage().pipe(
    ctx.flow.withSpan('Fetch page'),
    Effect.tap((page) =>
      ctx.flow.event('Page fetched', {
        attributes: { entityCount: page.length },
      }),
    ),
  );
```

## Sync Store and durability

Each instance uses an isolated Memory adapter by default. A platform may supply
a `storeLayer` that replaces it for that instance; any adapter layer built for
the `syncStore` table is accepted, including IndexedDB and SQLite. The Sync
Store holds both the Sync Replica and Sync State. Write failures surface as
`WriteError.Storage`; adapter-specific errors stay internal.

Tombstones remain in the Sync Replica. Persisted Sync State is tagged with its
strategy name and decoded with that strategy's schema. A name mismatch or
invalid state resets to the strategy's empty state.

Memory versus IndexedDB is a durability choice only. Both use Peer Sync when
it is available. IndexedDB can rebuild a Collection after reload; it does not
make another live tab's projection fresh without Peer Sync or backend
delivery.

## Peer Sync

Peer Sync is off unless the platform opts in. A platform enables it by
returning `peerSync: { channel }`. `browser()` does so with the
`broadcastChannel()` factory, which is also exported for custom platforms. One
Peer Channel belongs to each qualified Collection.

```ts
const custom = createStdSync({
  name: 'acme-production',
  platform: { peerSync: { channel: customPeerChannelFactory } },
});
```

The custom `PeerChannelFactory` receives the qualified Collection Name. Its
channel broadcasts unknown messages and subscribes a handler; Sync owns
envelope validation, serialized application, convergence, and cleanup.
Closing a Std Sync drains already-admitted deliveries. Optimistic values and
Registry Broadcasts with `persist: false` never enter Peer Sync. See
[ADR 0001](../src/sync/docs/adr/0001-peer-sync-is-a-freshness-path.md).

## Offline writes (Outbox)

```ts
const std = createStdSync({ name: 'acme', platform: browser(), outbox: true });
```

With `outbox: true`, every `insert` / `update` / `delete` writes an Outbox
Entry to the Sync Store first, then waits until the Backend confirms it. The
edit survives reloads (with a durable store) and stays optimistic while
offline. One leader tab drains the Outbox: rapid edits on one Entity fold into
one Request, different Entities' Queues drain in parallel, a rejected write
rolls back and stays in the Outbox as `failed`. The Backend sees arrival
order; last write wins. `pacedUpdate` becomes a plain `update` and `pacing` is
ignored. Opt a Collection out with `outbox: false`.

**Awaiting a write blocks until delivery.** `await todos.insert(...)` (or
`tx.isPersisted.promise`) does not resolve until the Backend confirms. Offline,
that can be hours. Do not put anything the user is waiting for behind that
`await`; the optimistic row is already visible. While a write is pending,
TanStack also holds incoming sync for that Collection, so a Mutation Callback
that never returns freezes the Collection's reads with no error. Put a timeout
in every `onInsert` / `onUpdate` / `onDelete` / `mutationFn`.

A Mutation Callback that finds the Backend unreachable fails with
`OutboxUnreachable`; the Entry stays `pending` until connectivity returns.
Anything else it throws marks the Entry `failed`.

Operations whose intent spans Collections or must run on the server are
Offline Actions:

```ts
const archiveProject = std.createOfflineAction({
  name: 'archive-project',
  payload: Schema.Struct({ projectId: Schema.String }),
  onMutate: ({ projectId }) =>
    projects.update(projectId, (d) => {
      d.archived = true;
    }),
  mutationFn: ({ projectId }) => api.archiveProject(projectId),
  queue: ({ projectId }) => projectId,
});
const tx = archiveProject({ projectId: 'p1' });
await tx.delivered;
```

Register Collections and actions at boot when you can: the Drainer starts once
every Collection created through `std.collection` is ready. An Entry whose
Collection or action the leader tab has not registered stays `pending` until a
leader that has it appears.

```ts
std.outbox.entity; // the stored entity, for inspection through the StdTable
std.outbox.transaction(id); // the live TanStack transaction in this tab, or null
await std.outbox.discard(id); // hard delete; its transaction rolls back
await std.reset(); // logout: stop, wipe the Sync Store, re-seed, restart
```

## Utilities and Registry Broadcasts

Keyed collections expose typed engine utilities:

```ts
tasks.utils.schema();
tasks.utils.applyToSyncReplica(entityOrEntities);
tasks.utils.pacedUpdate(taskId, { status: 'done' });
```

Per-row pending state is TanStack's `$synced` virtual prop; the durable,
cross-tab queue is the Outbox.

`applyToSyncReplica` returns an Effect and uses the same convergence path as
worker and mutation results. The Registry routes caller-owned Registry
Broadcasts among Collections owned by one Std Sync:

```ts
const registry = std.registry();
registry.process({ values: serverEntities, persist: true });
```

`persist: true` writes the Sync Replica and projects accepted changes.
`persist: false` only projects to a mounted Collection and stays tab-local.
Neither mode advances Sync State. Delivery is fire-and-forget: `process`
returns immediately, failures are reported through `onEvent`, and `dispose`
does not wait for delivery. Registry Broadcast and Peer Sync are separate code
paths and contracts.

Collection cleanup stops collection-owned sync work but does not close
persistence. `std.dispose()` closes the Sync Store runtime owned by that Std
Sync; outstanding Registry Broadcast deliveries are not part of that shutdown
boundary.
