# std-toolkit/sync

Effect-based synchronization for TanStack DB. Keyed collections may run total
sync, on-demand partition sync, or both. Every path converges through one local
Sync Replica, persisted through a Sync Store.

## Mental model

Each tab owns a Sync Replica and a TanStack DB Collection Projection. The
Backend is authoritative. Backend push or polling makes each replica eventually
correct; the projection makes that replica visible to TanStack queries.

Peer Sync is a same-origin freshness shortcut. After a tab accepts a
backend-confirmed Entity, it sends the complete Entity to the matching Collection
in other live tabs. Receivers apply the normal convergence rule to their own
replicas and advance mounted projections. A missed message is harmless: backend
sync repairs it. Optimistic values and Registry Broadcasts with `persist: false`
never enter Peer Sync.

## Setup

```typescript
import { createCollection } from '@tanstack/react-db';
import { Effect, Schedule } from 'effect';
import { createStdSync, paceStrategy, syncStrategy } from 'std-toolkit/sync';
import { browser } from 'std-toolkit/sync/platform/browser';

const std = createStdSync({
  name: 'acme-production',
  platform: browser(),
});
```

`platform` names the environment the instance runs in. Absent, the instance is
a solo participant: an isolated Memory Sync Store, no Leadership, no Peer Sync.
`browser()` is the shared-origin browser preset: an IndexedDB Sync Store
(database `std-sync` unless overridden via `databaseName`), Web Locks
Leadership, and Peer Sync over `BroadcastChannel`. A platform is a plain value;
instances may share one, because everything it provides is consumed per
qualified Collection Name.

`name` is normalized and qualifies every Collection Name. All tabs connected to
the same Backend dataset must use the same stable name. The qualified Collection
Name identifies its Sync Store namespace and its one Peer Channel; the schema's
original name remains the Entity `_e` identity.

`version` (optional, string or number) stamps the Sync Store. When an instance
boots with a different version than the one stored — including no stored
version at all, as on clients that predate versioning — it empties the whole Sync
Store — replicas, cursors, strategy state, for every namespace sharing that
store — before serving anything, then records the new version. Bump it whenever
the Backend is wiped or re-shaped so devices that cached the old data don't keep
showing it; leave it unset and nothing is ever cleared.

Use `std.collection(config)` when you want Sync to create the TanStack
collection. `createCollection(std.sync(config))` is also supported. Call
`await std.dispose()` when the sync instance is no longer needed.

## Sources

Every strategy reads through a source builder — `paginated`, `poll`, and `live`
for partitioned strategies, `once`, `poll`, and `subscribe` for single items.

`cursor` is **exclusive**: given a cursor, return entities strictly beyond it,
never the cursor entity itself. A `paginated` source pages until `fetch` returns
an empty batch, so an inclusive backend would re-serve the boundary entity
forever. Sync stops paging when the cursor stops advancing, but the last page is
then fetched twice — filter with `<` / `>`, not `<=` / `>=`. `cursor` is `null`
on the first fetch, meaning "start from the end".

Replacing the old `subscribeOlder` / `subscribeNewer` config: those resumed
_from and including_ the cursor. Tighten the comparison when porting them to
`paginated`.

## Total sync

Total sync eventually loads the complete entity set.

```typescript
const tasks = std.collection({
  schema: TaskSchema,
  sync: {
    total: {
      strategy: syncStrategy.oldToNew({
        source: ({ paginated }) =>
          paginated({
            fetch: ({ cursor }) => api.getTasks({ cursor }),
          }),
      }),
    },
  },
  updatePacing: paceStrategy.coalesce({ wait: 50 }),
  onInsert: (task) => api.createTask(task),
  onUpdate: ({ current, updates }) => api.updateTask(current, updates),
  onDelete: ({ current }) => api.deleteTask(current),
});
```

## Partition sync

A partition factory is activated by a matching TanStack query. Its parameter is
inferred from the schema field, and only string, number, and boolean fields may
be partition keys.

```typescript
const comments = std.collection({
  schema: CommentSchema,
  sync: {
    partitions: {
      postId: (postId) => ({
        strategy: syncStrategy.oldToNew({
          source: ({ paginated }) =>
            paginated({
              fetch: ({ cursor }) => api.getComments({ postId, cursor }),
            }),
        }),
      }),
    },
  },
});
```

## Hybrid sync

Total and partition workers can run together. For example, all comments can load
in the background while the selected post's comments are fetched immediately.
They keep separate progress but write through the same Sync Replica, so overlap is
deduplicated by entity id and `_u` convergence.

```typescript
const comments = std.collection({
  schema: CommentSchema,
  sync: {
    total: {
      strategy: syncStrategy.oldToNew({
        source: ({ paginated }) =>
          paginated({ fetch: ({ cursor }) => api.getAllComments({ cursor }) }),
      }),
    },
    partitions: {
      postId: (postId) => ({
        strategy: syncStrategy.oldToNew({
          source: ({ paginated }) =>
            paginated({
              fetch: ({ cursor }) => api.getComments({ postId, cursor }),
            }),
        }),
      }),
    },
  },
});
```

## Cadence repair

Repair is independent from the strategy and owns its own source. Declaring
`repair` without `cadence` inherits the instance default; omitting `repair`
disables it even when a default exists.

```typescript
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

## Effect runtime

All user callbacks and internal fallible or asynchronous operations are Effects.
Pass a `ManagedRuntime` when those Effects require services. Sync uses its
`runSync` and `runPromise` methods at TanStack's imperative boundaries. Without a
runtime it falls back to `Effect.runSync` and `Effect.runPromise`.

```typescript
import { Effect, ManagedRuntime } from 'effect';

const runtime = ManagedRuntime.make(AppLayer);
const std = createStdSync({ name: 'tasks', runtime });

const tasks = std.collection({
  schema: TaskSchema,
  sync: {
    total: {
      strategy: syncStrategy.oldToNew({
        source: ({ paginated }) =>
          paginated({
            fetch: ({ cursor }) =>
              Effect.gen(function* () {
                const api = yield* TaskApi;
                return yield* api.getTasks({ cursor });
              }),
          }),
      }),
    },
  },
});
```

The runtime environment is inferred across strategies, fetches, and mutation
callbacks, including `onEvent`. A required service that is absent from the
supplied runtime is a type error.

`onEvent` receives structured Events for lifecycle failures, initialization
failures, unserved queries, Registry Broadcast delivery, and Peer Sync phases.
Peer Sync reports `channel-creation`, `subscription`, `send`, `decode`, `receive`,
and `cleanup` failures without failing sync or mutation work. When omitted,
Events use Effect's logger.

## Flow tracing

Every Collection instance owns one Effect Tracer Flow with an id shaped as
`<qualified-collection-name>::<ulid>`. The same Flow remains active across
Collection starts, cleanup, and later restarts; Sync never ends it. Effect
telemetry configuration decides whether that Flow is exported.

The Flow has a `collection` lane, one global worker lane, one stable lane for each
logical Partition, a lane for each Cadence Repair worker, and one worker lane for
Single Item Sync. Repeated subscribers to the same Partition share its lane and
produce subscriber-count messages. Hydration is told as two activities on the
collection lane — `Load Sync Replica`, then `Project into Collection` — each
carrying its row count, and `Collection ready` closes it. Every supervised
strategy run is a `Sync session` activity numbered per retry; it stays running
for as long as the strategy does, and the built-in strategies record each
delivered batch as a child activity (`Receive batch`, `Backfill batch`,
`Tail batch`) so a live session visibly progresses. Strategies run inside that
activity so API and persistence spans are linked as nested trace work. Every
non-empty strategy or Cadence Repair delivery logs how many entities were
received and how many the Sync Replica accepted after convergence.

Every participant with a real lifecycle records an **Activation** — the window
in which it is alive. The collection lane is activated from `sync(callbacks)` to
cleanup, each strategy for its supervised run, and each partition for one
`0 -> 1 -> 0` subscribe cycle on its stable lane. A lane can be activated any
number of times but never twice at once, and the swim lane draws each Activation
as a solid rail whose end cap is coloured by its outcome.

Custom strategies can add high-level activities, events, and state through
`ctx.flow`:

```typescript
run: (ctx) =>
  api.fetchPage().pipe(
    ctx.flow.withSpan('Fetch page'),
    Effect.tap((page) =>
      ctx.flow.log('Page fetched', {
        attributes: { entityCount: page.length },
      }),
    ),
    Effect.tap((page) => ctx.flow.state({ lastPageSize: page.length })),
  );
```

`ctx.flow.state` publishes part of the participant's state; keys merge forward,
so a strategy can emit only what changed and the viewer can read the complete
state at any later point. A `null` value clears a key.

## Single-item sync

Use `singleItemSync` or `singleItemCollection` for a record with no id field.

```typescript
const settings = std.singleItemCollection({
  schema: SettingsSchema,
  source: ({ once }) => once({ fetch: () => api.getSettings() }),
  onUpdate: ({ updates }) => api.saveSettings(updates),
});
```

Use `poll` for scheduled snapshots or `subscribe` for a Stream that emits the
current complete value and later replacements.

```typescript
source: ({ poll }) =>
  poll({
    fetch: () => api.getSettings(),
    schedule: Schedule.spaced('5 seconds'),
  });

source: ({ subscribe }) => subscribe({ open: () => api.settingsStream() });
```

## Sync Store and durability

Each sync instance uses an isolated Memory adapter by default. A platform may
supply a `storeLayer` that replaces it globally for that instance; any adapter
layer created for `syncStore` is accepted, including IndexedDB and SQLite. The
Sync Store holds both the Sync Replica and Sync State. Write failures surface
as `WriteError.Storage` while adapter-specific errors remain internal.

Tombstones remain in the Sync Replica. Persisted Sync State is tagged with its strategy
name and decoded with that strategy's schema. A name mismatch or invalid state is
reset to the strategy's empty state.

Memory versus IndexedDB is a durability choice only. Both use Peer Sync when it
is available. IndexedDB can rebuild a Collection after reload; it does not make
another live tab's projection fresh without Peer Sync or backend delivery.

## Peer Sync

Peer Sync is off unless the platform opts in. The core has no default
transport: a platform enables Peer Sync by returning `peerSync: { channel }`.
`browser()` does so with the `broadcastChannel()` factory (also exported from
`std-toolkit/sync/platform/browser` for custom platforms). One Peer Channel
belongs to each qualified Collection, so messages never need routing by a
lossy display address.

```typescript
const custom = createStdSync({
  name: 'acme-production',
  platform: { peerSync: { channel: customPeerChannelFactory } },
});
```

The custom `PeerChannelFactory` receives the qualified Collection Name. Its
channel broadcasts unknown messages and subscribes a handler; Sync owns envelope
validation, serialized application, convergence, and cleanup. Closing a Std Sync
drains already-admitted deliveries.

See [ADR 0001](./docs/adr/0001-peer-sync-is-a-freshness-path.md) for why Peer
Sync carries complete Entities, uses one channel per qualified Collection, and
remains separate from storage identity and backend authority.

## Utilities and Registry Broadcasts

Keyed collections expose typed engine utilities:

```typescript
tasks.utils.schema();
tasks.utils.applyToSyncReplica(entityOrEntities);
tasks.utils.pacedUpdate(taskId, { status: 'done' });
tasks.utils.pendingCount(taskId);
tasks.utils.subscribePending(listener);
```

`applyToSyncReplica` returns an Effect and uses the same convergence path as
worker and mutation results. The Registry routes caller-owned Registry Broadcasts
among Collections owned by one Std Sync:

```typescript
const registry = std.registry();
registry.process({ values: serverEntities, persist: true });
```

`persist: true` writes the Sync Replica and projects accepted changes.
`persist: false` only projects to a mounted Collection and remains tab-local.
Neither mode advances Sync State. Registry Broadcast delivery is
fire-and-forget: `process` returns immediately, failures are reported through
`onEvent`, and `dispose` does not wait for delivery. Registry Broadcast and Peer
Sync are separate code paths and contracts.

Collection cleanup stops collection-owned sync work but does not close
persistence. `std.dispose()` closes the Sync Store runtime owned by that Std
Sync; outstanding Registry Broadcast deliveries are not part of that
shutdown boundary.
