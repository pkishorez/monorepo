# @kestack/devtools-kabuki

Kabuki apps in DevTools: each running app serves its History, Snapshots and graph as a Kabuki Session over Effect RPC

## Big picture

A [Kabuki](../../packages/kabuki/README.md) app keeps everything it did in
its History, but only the tab it runs in has the Actors' code to replay it.
This package lets the tab answer questions about itself. Attached to an
app, it connects the app to the local [DevTools](../devtools/README.md)
Server as a Kabuki Session and answers the Kabuki Session Api there: the
History, the Snapshot at any Step, what one Step changed, the graph the
Inspector draws, the Blueprint of every Actor the app can grow, one
Instance's Trail, any Branch of the History, and Seeking a Step in the app
or Forking it. It reads Kabuki only through its public surface, the
Blueprint, History and its Branches, Snapshots, Trails and Addresses, never
how the engine holds an Actor.

The connection is reversed. The app dials
`ws://127.0.0.1:14400/kabuki/connect` and serves the Api over that socket.
DevTools is the client, so the CLI and the DevTools `/kabuki` page can ask
any live Kabuki Session the same questions. The in-page dock asks the same
Api in memory, with nothing serialized. Why the app serves and DevTools
asks is in [ADR 0001](./docs/adr/0001-the-app-serves-devtools-calls.md).

The words used here (Kabuki Session, Kabuki Session Api, Attachment) are
defined in [CONTEXT.md](./CONTEXT.md).

## Install

```sh
pnpm add @kestack/devtools-kabuki
```

Peer dependencies:

- `@kestack/kabuki`: the app whose History and Snapshots are answered.
- `@kestack/web-platform`, `react`, `react-dom`: what the Inspector, in
  `./inspector`, is drawn with.
- `effect` (`^4.0.0`): the Api is an Effect RPC group, served with Effect's
  socket protocol.

## Exports

### `@kestack/devtools-kabuki/api`

The Kabuki Session Api, shared by the app, DevTools and the Inspector.

| Export                | What it does                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `KabukiSessionApi`    | The RPC group: `info`, `named`, `history`, `watch`, `page`, `snapshot`, `changes`, `graph`, `blueprint`, `node`, `trail`, `seek`, `fork`.    |
| `CONNECT_PATH`        | The DevTools Server path a Kabuki Session dials, `/kabuki/connect`.                                                                          |
| `DEFAULT_ENVIRONMENT` | The Environment of a Kabuki Session given none and on no page, `default`.                                                                    |
| `serialization`       | The RPC serialization both ends of the socket use: one JSON message per frame.                                                               |
| `StepNotFound`        | The error for a Step no longer kept; says the oldest and newest kept.                                                                        |
| `PathNotFound`        | The error for a Snapshot path that is not there; lists the keys where it stopped.                                                            |
| `InstanceNotFound`    | The error for an Address no Instance has at a Step, or the Blueprint has no place for; lists the Instances there are.                        |
| `Step`                | The Schema of a Step: an entry id, or `'init'`.                                                                                              |
| `Entry`               | The Schema of a History entry: the Address it was Sent to, its Message encoded, who Sent it, what came of it.                                |
| `From`                | The Schema of who Sent a Message.                                                                                                            |
| `Outcome`             | The Schema of what came of a Message: handled, ignored or dropped.                                                                           |
| `Info`                | The Schema of who a Kabuki Session is: app, page and name.                                                                                   |
| `Now`                 | The Schema of where the app is: Head, Branch size, the Step it Seeks, whether it is running or stopped, failure.                             |
| `History`             | The Schema of a Branch, the Head's unless asked, as `history` answers it: its entries, where it splits, and every Branch's last entry.       |
| `Split`               | The Schema of a Step a Branch goes on from in more than one way, and every entry that follows it.                                            |
| `SnapshotView`        | The Schema of a Snapshot, or part of one, at a Step.                                                                                         |
| `ValueChange`         | The Schema of one Model or Props path that changed, before and after.                                                                        |
| `DiffRow`             | The Schema of one line of a unified diff.                                                                                                    |
| `ChangeKind`          | The Schema of whether a Step added, changed or removed an Instance.                                                                          |
| `InstanceChange`      | The Schema of what a Step did to one Instance: started, changed or stopped it, and the Workers it started and stopped, as the Snapshots say. |
| `Changes`             | The Schema of what one Step did: its entry, its Commands, each Instance it changed.                                                          |
| `Condition`           | The Schema of when a Worker or Child exists: always, while or each.                                                                          |
| `Level`               | The Schema of one Blueprint level: the top, or one State's block.                                                                            |
| `Blueprint`           | The Schema of what an Actor is, as its Blueprint says, each level's Provides declared.                                                       |
| `WorkerNow`           | The Schema of a Worker and the keys it runs for, at the Head of a running app.                                                               |
| `Known`               | The Schema of which Message moved an Actor from which State to which, along the Head's Branch.                                               |
| `GraphNode`           | The Schema of one card on the canvas, with its Children.                                                                                     |
| `Graph`               | The Schema of the graph at a Step.                                                                                                           |
| `Blueprinted`         | The Schema of every Actor the app's root can grow, each by its place, whether it runs or not.                                                |
| `Shape`               | The Schema of a Schema as a card draws it.                                                                                                   |
| `Field`               | The Schema of one field of a Shape.                                                                                                          |
| `Node`                | The Schema of one Instance's card at a Step: data, change, Schemas and Provides.                                                             |
| `Moment`              | The Schema of one moment of a Trail: its entry, and whether it started, changed, was Sent to or stopped the Instance.                        |
| `Trail`               | The Schema of one Instance's Trail along a Branch, oldest first.                                                                             |

### `@kestack/devtools-kabuki/session`

The app's side: answers the Api from one running app.

| Export          | What it does                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `connect`       | Connects an app to the DevTools Server as a Kabuki Session; given only options, it is an Attachment.                   |
| `inMemory`      | An Api client answered by the app in the same page, with nothing serialized.                                           |
| `ASKED`         | The page URL's query parameter that names a Kabuki Session, `kabuki-session`.                                          |
| `DEVTOOLS_PATH` | Where `connect` dials by default, `/__devtools` on the page's origin, as the Web Platform proxies it while developing. |

### `@kestack/devtools-kabuki/server`

The DevTools side: keeps the live Kabuki Sessions and forwards their Api to
DevTools' own page and CLI. It needs only `effect`, so its clients run in a
browser too.

| Export                  | What it does                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `kabukiRoutes`          | The Layer of routes a DevTools Server mounts on its HttpRouter: `/kabuki/connect`, `/kabuki/sessions`, `/kabuki/session/:name`. |
| `dialSessions`          | A client of the live Kabuki Sessions, `list` and `watch`, through a DevTools Server's `/kabuki/sessions`.                       |
| `dialSession`           | One Kabuki Session's Api client through a DevTools Server's `/kabuki/session/:name`: the same client `inMemory` gives the dock. |
| `KabukiSessionsApi`     | The RPC group of the live Kabuki Sessions: `list`, and `watch` as a stream.                                                     |
| `KabukiSessionSummary`  | The Schema of a live Kabuki Session as listed: name, app, page, origin, when connected.                                         |
| `KabukiSessionNotFound` | The error for a name no live Kabuki Session has; lists those that are.                                                          |
| `SESSIONS_PATH`         | The path of the live list, `/kabuki/sessions`.                                                                                  |
| `sessionPath`           | The path of one Kabuki Session's Api, `/kabuki/session/<name>`.                                                                 |
| `grouped`               | Kabuki Sessions by app, A to Z, then Environment, this computer's first: how DevTools' page and CLI list them.                  |
| `isLocalEnvironment`    | Whether an Environment is a host on this computer, as `localhost:5173`.                                                         |

`/kabuki/connect` takes any origin, and records it. `/kabuki/sessions` and
`/kabuki/session/:name` read and move tabs, so they answer only a request
with no `Origin`, as from the CLI, or with one of the `origins` given to
`kabukiRoutes`.

### `@kestack/devtools-kabuki/inspector`

The Inspector, Kabuki Actors that read and move one Kabuki Session only
through the Api.

| Export            | What it does                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KabukiInspector` | The Inspector beside a running app in the same page, from `App.useRuntime()`, its Kabuki Session answered in memory: for an in-page dock.            |
| `InspectorLive`   | The Inspector Actor, to place as a Child; its Input is `{ travel, look: { presenting, place } }`.                                                    |
| `InspectorView`   | The Inspector Actor's View.                                                                                                                          |
| `KabukiSession`   | The one Capability the Inspector Requires: a Kabuki Session Api client, Provided by whoever places it.                                               |
| `Story`           | The type of a Story, with `Scene`, `Moment` and `Part`: data only, as the Inspector plays none for now.                                              |
| `sources.css`     | `@kestack/devtools-kabuki/inspector/sources.css`: import it beside the Web Platform's Theme so the app's Tailwind generates the Inspector's classes. |

## Usage

### Connect an app to DevTools

Attach `connect` to the app. Each time Kabuki starts the app in a browser
it dials DevTools and answers it until the app stops.

```ts
import { View } from '@kestack/kabuki/react';
import { connect } from '@kestack/devtools-kabuki/session';

export const App = View.app(ShopView, {
  layer: ShopLive,
  attach: import.meta.env.DEV ? [connect()] : [],
});
```

How it works:

- DevTools lists it under its app, then its Environment: the page's host,
  or `environment` when given, as a server would give `os.hostname()`;
  `default` with neither.
- With no `url` it dials `/__devtools` on the page's own origin, whose
  `/kabuki/connect` the Web Platform's `app()` pipes to the DevTools Server
  under `vite dev`, so a tunnel to the app reaches DevTools too. Elsewhere, give the whole URL:
  `connect({ url: 'wss://devtools.example.com' })`.

- The name asked for is the page's `?kabuki-session`, else `name`, else the
  one this tab used before, else a readable one such as `quiet-otter`.
- DevTools calls `named` with the final name, `quiet-otter-2` on a clash;
  the tab keeps it in sessionStorage and dials with it from then on.
- While DevTools is down or restarting the app dials again, from half a
  second up to every ten; nothing reaches the app.

### Ask a running app about itself

`inMemory` gives the same client DevTools has, served by the app in the
page, given the app as `App.useRuntime()` or an Attachment has it. Every
answer is plain JSON, values encoded by their Actors' Schemas.

```ts
import { Effect } from 'effect';
import { inMemory } from '@kestack/devtools-kabuki/session';

const program = Effect.gen(function* () {
  const client = yield* inMemory(app);
  const { entries, head } = yield* client.history({ last: 5 });
  const note = yield* client.snapshot({ path: 'model.notes.1' });
  const step = yield* client.changes({ step: head! });
  const graph = yield* client.graph({});
  const card = yield* client.node({ instance: 'Diary' });
  const trail = yield* client.trail({ instance: 'Diary/counter#1' });
  const { tips } = yield* client.history({});
  const other = yield* client.history({ branch: tips[0]! });
  yield* client.seek({ step: entries[0]!.id });
  yield* client.seek({ step: null });
  yield* client.fork({ from: entries[0]!.id });
});

await Effect.runPromise(Effect.scoped(program));
```

How it works:

- `at` absent means the Head; `'init'` the app right after init; an entry
  id the Step right after it, else a `StepNotFound` naming those kept.
- An Instance is named by its Address, `Diary/counter#1`. What a Step
  changed is what Kabuki marks on each Instance, which entry started it and
  which last changed it; what came of a Message is its entry played again.
- `history` and `trail` read the Head's Branch, or with `branch` the one
  through that entry: the Head's if it passes through it, else the newest
  that does. `history` says every Branch's last entry, `tips`, and each
  Step on the Branch it reads that the History goes on from in more than
  one way, `splits`, with every entry that follows it.
- `seek` Time Travels the app to any entry on any Branch while its Runtime
  stays where it is, `'init'` too; `null` draws its Head again. `fork` moves the same
  Runtime's Head to an entry, or init with `null`, so the next Message
  grows a new Branch; it runs no past Command.
- Which Workers run is known only at the Head of a running app, from the
  Runtime; a past Step names none. Which Workers a Step started or stopped
  is known at any Step: the ones `Snapshot.workers` finds the data asks for
  after it and not before, or before it and not after.
- A call made before the app has its Runtime waits for it. The app keeps
  that one Runtime through every Seek and Fork.
- `snapshot` folds a large value to its first levels and items unless
  `expand`; a path that is not there fails, listing the keys there are.
- `watch` streams `Now` at once and after every change the app reports.
- `page` streams the page the app runs in at once, and again each time it moves to another; DevTools follows it to keep the listed page current.

### Show the Inspector beside the app

```tsx
import { KabukiInspector } from '@kestack/devtools-kabuki/inspector';

function Devtools() {
  const app = App.useRuntime();
  return <KabukiInspector runtime={app} overlay />;
}
```

```css
@import '@kestack/web-platform/ui/theme/global.css';
@import '@kestack/devtools-kabuki/inspector/sources.css';
```

How it works:

- Every Instance is a card on a canvas to pan and zoom, over a Timeline of
  every Step on the Branch in view, the Head's until another is picked.
  With Travel the app on, as `defaultTravel` says at first, a Step picked
  Time Travels the app and Fork moves the app's Head to it. Go to Head
  draws the Head again; there the Timeline says whether the app is running
  or stopped.
- Where the History goes on from the Step shown in more than one way, the
  Timeline offers each entry that follows it; one picked is shown and its
  Branch comes into view. Back and forward walk the Branch in view. A Step
  the app Seeks off it brings its Branch into view.
- An open card's footprints switch follows its Instance's Trail: only that
  card shows, and the Timeline only the moments it started, changed,
  received a Message or stopped. Back, forward, the track and Play go from
  moment to moment, Time Travelling the app as Travel the app says. The
  switch pressed again, or the card closed, shows the whole tree again.
- Its Blueprint tab draws every Actor the app's root can grow, running or
  not, each level's Provides as declared: the whole tree, nothing folded or
  dimmed. A card pressed opens; one right clicked opens and comes to the
  middle.
- `presenting` keeps only the canvas; `timelineAt="top"` puts the Timeline
  over it; `dotted={false}` or `overlay` drops the dots.
- It is a Kabuki app of its own, never attached to DevTools itself, named
  after the app it inspects, so it opens again as it was left.

### Place the Inspector in another Kabuki app

Invoke `InspectorLive` as a Child, keyed by the Kabuki Session's name, and
draw it with `<InspectorView instance={children.inspector} />`. Provide
`KabukiSession` above it as a Layer of that Kabuki Session's client: a
Provides is built when its level starts, so give it in a State that lasts
while that one Kabuki Session is chosen, as DevTools' `/kabuki` page does
with a client that reaches the tab through DevTools.

```ts
inspector: {
  actor: InspectorLive,
  input: () => ({
    travel: true,
    look: { presenting: false, place: 'bottom' },
  }),
},
```
