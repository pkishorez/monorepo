# @kestack/std-toolkit/replica

Kabuki-native sync: local copies of the Backend kept fresh on the device, where every Instance, Query and Action is an actor or a Command.

## Big picture

A Replica is one domain's local copy of the Backend, made in two steps, as the toolkit makes things: `Replica.make` says its Key and Collections, `Replica.build` its Gate, its GC Time, and how each Collection syncs: a Strategy for all of it, a Strategy per Window, or both. A Window is the records whose field reads one value, such as the entries of one wallet; a Query whose `where` filters on that field opens it, and its Strategy runs while it is open. Each Key gets its own Instance, an actor that loads what the Store holds into plain `@tanstack/db` Collections, so it reads at once, and fetches only while it leads and its Gate is open. One `Replicas` actor near the root runs the Instances in use and stops each once its GC Time passes with no one holding it. Its Model and each Instance's are the whole record of what runs, so time travel and the Inspector see sync like any other Message.

On the device the Store is the truth: `Store.idb()` keeps one IndexedDB database per Instance, shared by the browser's tabs through a Web Lock (the Leader) and a BroadcastChannel (the Doorbell); `Store.memory()` does the same in one process. Each tab records the Windows it has open there, so the Leader runs every tab's, and tells every tab which of them are Caught Up; each scope's saved cursor says it has synced once on this device. Entities travel and are stored in encoded form and show in Collections at their latest version, with their meta under `_meta`. A Query reads rows from any Instances as an actor's Model, one Message per change, says whether everything it reads is Caught Up, and names the Instances whose part of it has never synced here; an Action makes Optimistic Changes, calls the Backend, and Confirms what came back, or rolls everything back.

It replaces [`sync`](../sync/README.md) for Kabuki apps and shares no code with it. Vocabulary is in [CONTEXT.md](CONTEXT.md); Kabuki's is in [@kestack/kabuki](../../../../packages/kabuki/CONTEXT.md).

## Install

See the [top README](../../README.md). This subpath needs the optional peers `@kestack/kabuki` and `@tanstack/db`.

## Exports

### `@kestack/std-toolkit/replica`

| Export              | What it does                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Replica.make`      | Says what a Replica is: its name, its Key Schema if it has one, and its Collections as entity ESchemas; it gets `get`.            |
| `Replica.build`     | Says how each Instance of a Replica syncs: its Gate, its GC Time, and per Collection a Strategy, one per Window, or both.         |
| `Replicas`          | The Capability `get` holds Instances through; what runs is in the Model of the actor `Replicas.child` places.                     |
| `Replicas.layer`    | The Layer a page Provides, once, near the root.                                                                                   |
| `Replicas.child`    | The Child the same page places once, running the Builds it is given.                                                              |
| `Query.make`        | Makes a Query: an actor whose Model is rows from Collections of the Instances its Props pick.                                     |
| `Action.make`       | Defines an Action as a Kabuki Command that ends with one Message tagged with its name.                                            |
| `Action.optimistic` | Makes Optimistic Changes inside an Action, across Instances and Replicas, rolled back if the Action fails.                        |
| `oldToNew`          | A Strategy that reads from the oldest change forward, by pulling, by subscription, or both, with an optional Settle Window.       |
| `newToOld`          | A Strategy that reads the newest page first on every open, fills in older pages, and keeps the top fresh.                         |
| `Store`             | The Capability where Instances are kept: `list` them, `remove` one (stopping it everywhere first), or `open` an Instance's space. |
| `ReplicaError`      | What a Replica fails with: a Store that failed, an Instance that stopped, a Replica not run here.                                 |

### `@kestack/std-toolkit/replica/idb`

| Export      | What it does                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Store.idb` | The Store in IndexedDB, shared by the browser's tabs; `retired` names Replicas whose Instances it deletes as it starts. |

### `@kestack/std-toolkit/replica/memory`

| Export         | What it does                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `Store.memory` | The Store in memory; every app given the same Layer shares it as tabs do, for tests and stories. |

## Usage

### Define a Replica, build it, and run it under the root page

A Pocket holds an account's wallets and entries. Its Build reads every wallet from the Backend while the account is signed in, and the entries of only the wallets a Query asks for; the root page Provides `Replicas` and places its runner once.

```ts
const Pocket = Replica.make('pocket', {
  key: Schema.String,
  collections: { wallets: Wallet, entries: Entry },
});

const PocketLive = Replica.build(Pocket, {
  gate: ({ key }) => signedIn(key),
  gcTime: '5 seconds',
  collections: {
    wallets: {
      strategy: oldToNew({
        fetch: ({ key, after }) => api.wallets(key, after),
        pollEvery: '2 seconds',
      }),
    },
    entries: {
      windows: {
        walletId: (walletId) =>
          oldToNew({
            fetch: ({ key, after }) => api.entries(key, walletId, after),
            pollEvery: '2 seconds',
          }),
      },
    },
  },
});

const Root = Actor.build(Actor.define('Root', {}), {
  provides: () => Replicas.layer,
  children: {
    replicas: Replicas.child([PocketLive]),
    page: { actor: PageLive },
  },
});

// The app's Layer: import { Store } from '@kestack/std-toolkit/replica/idb'
const App = toReact(Root, RootView, Store.idb());
```

- `fetch` gets the Key and the newest Entity kept so far, in encoded form, and returns Entities in encoded form. Whatever it and the Gate need from the app's Layer bubbles up to it, as a Child's needs do.
- A Strategy's first answer makes its scope Caught Up, even an answer with nothing in it. A `subscribe` feed answers with its first batch, so one with nothing to replay sends an empty batch first; until it does, nothing it reads is Caught Up.
- A Window's field is a path of the Collection's value that reads a string, number or boolean; its factory gets the value and closes over it. Each Strategy scope, the whole Collection or one Window, keeps its own cursor.
- `gcTime` is how long an Instance, or a Window, runs on once nothing uses it; `Infinity` keeps it running until the Store removes it.
- While the Gate is closed the Instance stays readable from the Store; no Strategy runs. Only the tab that leads an Instance fetches, every tab's open Windows included; the others read what it stores.
- `oldToNew({ settleWindow: '5 seconds', ... })` is for a Backend that may make a write readable late: each read starts that far back from the newest change read, and the cursor never moves past it. Off unless given.
- An Entity at a version newer than the app knows is left out with a warning, and its cursor stays put. A tombstone (`_d`) stays in the Store and takes its row away.

### Read rows with a Query, and draw it

A Query is an actor: place it as a Child, hand it Props, and draw its Model with `View.make` like any other.

```ts
const Wallets = Query.make('Wallets', {
  props: Schema.Struct({ account: Schema.String }),
  from: ({ props }) => Effect.all({ pocket: Pocket.get(props.account) }),
  query: (_, { pocket }) => (q) => q.from({ w: pocket.wallets }),
});

// Its `where` opens the Window of that wallet: its Strategy runs while it shows.
const WalletEntries = Query.make('WalletEntries', {
  props: Schema.Struct({ account: Schema.String, walletId: Schema.String }),
  from: ({ props }) => Effect.all({ pocket: Pocket.get(props.account) }),
  query: ({ props }, { pocket }) => (q) =>
    q.from({ e: pocket.entries }).where(({ e }) => eq(e.walletId, props.walletId)),
});

// In the page's Build:
// children: { wallets: { actor: Wallets, props: ({ model }) => ({ account: model.account }) } }

// Stored rows show at once; with none, a skeleton only until it first syncs here.
const WalletsView = View.make(Wallets, ({ model, root }) =>
  model.status === 'failed' ? (
    <p {...root}>{model.problem}</p>
  ) : model.rows.length === 0 && model.neverSynced.length > 0 ? (
    <Skeleton {...root} />
  ) : model.rows.length === 0 ? (
    <p {...root}>No wallets yet.</p>
  ) : (
    <ul {...root}>
      {model.rows.map(({ id, row }) => (
        <li key={id}>{row.name}: {row.balance}</li>
      ))}
    </ul>
  ),
);
```

- `model.keys` names the Instances the rows come from; `model.rows` holds each row under its key.
- Props that pick another Instance clear the rows at once, then load the new ones; the Instance the old Props held runs on for its GC Time. Each change after arrives as one Message of the rows added, updated and removed.
- An `eq` on a Window's field opens one Window, an `inArray` one per value, any other filter none. The rows the Store holds show at once; the Window only decides what is fetched. Props that pick another wallet let go of the old Window, which closes once its GC Time passes.
- `model.caughtUp` says whether every Collection and Window the query reads is Caught Up: each Collection's whole Strategy, if it has one, and each Window its `where` opened. Until then no rows may only mean none read yet; after, an empty list can be believed. It goes back to `false` while a Strategy it waits on stops, as a closed Gate stops it. In a tab that follows, it is what the Leader tells.
- `model.neverSynced` names the Instances holding a Collection or Window the query reads that has never synced on this device. A Strategy's first answer saves its cursor even when it holds nothing, so after a reload, or while the Gate is shut, an Instance not named here shows what it last synced, an empty list included, without waiting to be Caught Up. Draw a skeleton only for the Instances it names.

### Write with an Action

```ts
const Transfer = Action.make('Transfer', {
  args: Schema.Struct({
    account: Schema.String,
    wallet: Schema.String,
    amount: Schema.Finite,
  }),
  run: (args) =>
    Effect.gen(function* () {
      const pocket = yield* Pocket.get(args.account);
      yield* Action.optimistic(() =>
        pocket.wallets.update(args.wallet, (draft) => {
          draft.balance -= args.amount;
        }),
      );
      const saved = yield* api.transfer(args);
      yield* pocket.confirm(saved);
    }),
});

// The page Requires Replicas, and its Message Schema has `Transfer: Transfer.result`.
// The ending Message carries the args it was asked with, so several can run at once:
// on: { Asked: (args) => ({ command: Transfer(args) }), Transfer: ({ args, failed }, { model }) => ... }
```

- The Instance the Action gets runs until it ends and shows it as pending. Its args name the Key it writes.
- Confirm stores what the Backend returned before the Optimistic Changes go, so the rows never flicker back. A failure anywhere, a Confirm on an Instance that stopped included, rolls every change back, across Instances.
