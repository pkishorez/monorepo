# @kestack/std-toolkit/replica

Kabuki-native sync: local copies of the Backend kept fresh on the device, where every Instance, Query and Action is an actor or a Command.

## Big picture

A Replica is one domain's local copy of the Backend, written like a Kabuki actor in two steps: `Replica.define` says its Key and Collections, `Replica.build` its Gate and a Strategy per Collection. Each Key gets its own Instance, an actor that loads what the Store holds into plain `@tanstack/db` Collections, so it reads at once, and fetches only while it leads and its Gate is open. One `Replicas` actor near the root runs the Instances in use, lets each linger after its last holder leaves, and shows them all as `state`, so time travel and the Inspector see sync like any other Message.

On the device the Store is the truth: `Store.idb()` keeps one IndexedDB database per Instance, shared by the browser's tabs through a Web Lock (the Leader) and a BroadcastChannel (the Doorbell); `Store.memory()` does the same in one process. Entities travel and are stored in encoded form and show in Collections at their latest version, with their meta under `_meta`. A Query reads rows from any Instances as an actor's Model, one Message per change; an Action makes Optimistic Changes, calls the Backend, and Confirms what came back, or rolls everything back.

It replaces [`sync`](../sync/README.md) for Kabuki apps and shares no code with it. Vocabulary is in [CONTEXT.md](CONTEXT.md); Kabuki's is in [@kestack/kabuki](../../../../packages/kabuki/CONTEXT.md).

## Install

See the [top README](../../README.md). This subpath needs the optional peers `@kestack/kabuki` and `@tanstack/db`.

## Exports

### `@kestack/std-toolkit/replica`

| Export              | What it does                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Replica.define`    | Says what a Replica is: its name, its Key Schema if it has one, and its Collections as entity ESchemas; it gets `get`.            |
| `Replica.build`     | Says how each Instance of a Replica syncs: its Gate, and a Strategy per Collection.                                               |
| `Replicas`          | The Capability that shows every running Instance as `state`, and what `get` holds Instances through.                              |
| `Replicas.layer`    | The Layer a page Provides, with how long an Instance lingers and which Replicas are kept.                                         |
| `Replicas.child`    | The Child the same page places once, running the Builds it is given.                                                              |
| `Query.define`      | Defines a Query: an actor whose Model is rows from Collections of the Instances its Props pick.                                   |
| `Action.make`       | Defines an Action as a Kabuki Command that ends with one Message tagged with its name.                                            |
| `Action.optimistic` | Makes Optimistic Changes inside an Action, across Instances and Replicas, rolled back if the Action fails.                        |
| `Action.result`     | The fields of the Message an Action ends with, for the caller's Message Schema.                                                   |
| `oldToNew`          | A Strategy that reads from the oldest change forward, by pulling, by subscription, or both.                                       |
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

A Pocket holds an account's wallets and entries. Its Build reads both from the Backend while the account is signed in; the root page Provides `Replicas` and places its runner once.

```ts
const Pocket = Replica.define('pocket', {
  key: Schema.String,
  collections: { wallets: Wallet, entries: Entry },
});

const PocketLive = Replica.build(Pocket, {
  gate: ({ key }) => signedIn(key),
  collections: {
    wallets: {
      strategy: oldToNew({
        fetch: ({ key, after }) => api.wallets(key, after),
        pollEvery: '2 seconds',
      }),
    },
    entries: {
      strategy: oldToNew({
        fetch: ({ key, after }) => api.entries(key, after),
        pollEvery: '2 seconds',
      }),
    },
  },
});

const Root = Actor.build(Actor.define('Root', {}), {
  provides: () => Replicas.layer({ linger: '5 seconds' }),
  children: {
    replicas: Replicas.child([PocketLive]),
    page: { actor: PageLive },
  },
});

// The app's Layer: import { Store } from '@kestack/std-toolkit/replica/idb'
const App = toReact(Root, RootView, Store.idb());
```

- `fetch` gets the Key and the newest Entity kept so far, in encoded form, and returns Entities in encoded form. Whatever it and the Gate need from the app's Layer bubbles up to it, as a Child's needs do.
- While the Gate is closed the Instance stays readable from the Store; no Strategy runs. Only the tab that leads an Instance fetches; the others read what it stores.
- An Entity at a version newer than the app knows is left out with a warning, and its cursor stays put. A tombstone (`_d`) stays in the Store and takes its row away.

### Read rows with a Query, and draw it

A Query is an actor: place it as a Child, hand it Props, and draw its Model with `View.make` like any other.

```ts
const Wallets = Query.define('Wallets', {
  props: Schema.Struct({ account: Schema.String }),
  from: ({ props }) => Effect.all({ pocket: Pocket.get(props.account) }),
  query: (_, { pocket }) => (q) => q.from({ w: pocket.wallets }),
});

// In the page's Build:
// children: { wallets: { actor: Wallets, props: ({ model }) => ({ account: model.account }) } }

const WalletsView = View.make(Wallets, ({ model, root }) =>
  model.status === 'failed' ? (
    <p {...root}>{model.problem}</p>
  ) : (
    <ul {...root} aria-busy={model.status === 'loading'}>
      {model.rows.map(({ id, row }) => (
        <li key={id}>{row.name}: {row.balance}</li>
      ))}
    </ul>
  ),
);
```

- `model.keys` names the Instances the rows come from; `model.rows` holds each row under its key.
- Props that pick another Instance clear the rows at once, then load the new ones; the Instance the old Props held lingers. Each change after arrives as one Message of the rows added, updated and removed.

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

// The page Requires Replicas, and its Message Schema has `Transfer: Action.result`:
// on: { Asked: (args) => ({ command: Transfer(args) }), Transfer: ({ failed }, { model }) => ... }
```

- The Instance the Action gets runs until it ends and shows it as pending. Its args name the Key it writes.
- Confirm stores what the Backend returned before the Optimistic Changes go, so the rows never flicker back. A failure anywhere, a Confirm on an Instance that stopped included, rolls every change back, across Instances.
