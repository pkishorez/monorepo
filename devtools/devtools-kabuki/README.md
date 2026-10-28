# @kestack/devtools-kabuki

Kabuki apps in DevTools: each running app serves its History, Snapshots and graph as a Kabuki Session over Effect RPC

## Big picture

A [Kabuki](../../packages/kabuki/README.md) app keeps everything it did in
its History, but only the tab it runs in has the Actors' code to replay it.
This package lets the tab answer questions about itself. Attached to an
app, it connects the app to the local [DevTools](../devtools/README.md)
Server as a Kabuki Session and answers the Kabuki Session Api there: the
History, the Snapshot at any Step, what one Step changed, the graph the
Inspector draws, and travelling or forking the app.

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

| Export                | What it does                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `KabukiSessionApi`    | The RPC group: `info`, `named`, `history`, `watch`, `page`, `snapshot`, `changes`, `graph`, `node`, `travel`, `fork`. |
| `CONNECT_PATH`        | The DevTools Server path a Kabuki Session dials, `/kabuki/connect`.                                                   |
| `DEFAULT_ENVIRONMENT` | The Environment of a Kabuki Session given none and on no page, `default`.                                             |
| `serialization`       | The RPC serialization both ends of the socket use: one JSON message per frame.                                        |
| `StepNotFound`        | The error for a Step no longer kept; says the oldest and newest kept.                                                 |
| `PathNotFound`        | The error for a Snapshot path that is not there; lists the keys where it stopped.                                     |
| `InstanceNotFound`    | The error for an Instance not in the Snapshot at a Step; lists the ones that are.                                     |
| `Step`                | The Schema of a Step: an entry id, or `'init'`.                                                                       |
| `Entry`               | The Schema of a History entry, its Message encoded.                                                                   |
| `Source`              | The Schema of who Sent a Message.                                                                                     |
| `Outcome`             | The Schema of what came of a Message: handled, ignored or dropped.                                                    |
| `Info`                | The Schema of who a Kabuki Session is: app, page and name.                                                            |
| `Now`                 | The Schema of where the app is: Head, Branch size, Step shown, running, failure.                                      |
| `History`             | The Schema of the Head's Branch as `history` answers it.                                                              |
| `SnapshotView`        | The Schema of a Snapshot, or part of one, at a Step.                                                                  |
| `ValueChange`         | The Schema of one Model or Props path that changed, before and after.                                                 |
| `DiffRow`             | The Schema of one line of a unified diff.                                                                             |
| `ChangeKind`          | The Schema of whether a Step added, changed or removed an Instance.                                                   |
| `InstanceChange`      | The Schema of what a Step did to one Instance.                                                                        |
| `Changes`             | The Schema of what one Step did: its entry, its Commands, each Instance it changed.                                   |
| `Condition`           | The Schema of when a Worker or Child exists: always, while or each.                                                   |
| `Level`               | The Schema of one Blueprint level: the top, or one State's block.                                                     |
| `Blueprint`           | The Schema of what an Actor is, read from its definition.                                                             |
| `WorkerNow`           | The Schema of a Worker and the keys it runs for.                                                                      |
| `Known`               | The Schema of what the app was seen to do with an Actor.                                                              |
| `GraphNode`           | The Schema of one card on the canvas, with its Children.                                                              |
| `Graph`               | The Schema of the graph at a Step.                                                                                    |
| `Shape`               | The Schema of a Schema as a card draws it.                                                                            |
| `Field`               | The Schema of one field of a Shape.                                                                                   |
| `Node`                | The Schema of one Instance's card at a Step: data, change and Schemas.                                                |

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
import { toReact } from '@kestack/kabuki/react';
import { connect } from '@kestack/devtools-kabuki/session';

export const App = toReact(Shop, ShopView, ShopLive, {
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
page. Every answer is plain JSON, values encoded by their Actors' Schemas.

```ts
import { Effect } from 'effect';
import { inMemory } from '@kestack/devtools-kabuki/session';

const program = Effect.gen(function* () {
  const client = yield* inMemory(runtime);
  const { entries, head } = yield* client.history({ last: 5 });
  const note = yield* client.snapshot({ path: 'model.notes.1' });
  const step = yield* client.changes({ step: head! });
  const graph = yield* client.graph({});
  const card = yield* client.node({ instance: 'Diary' });
  yield* client.travel({ step: entries[0]!.id });
  yield* client.travel({ step: null });
});

await Effect.runPromise(Effect.scoped(program));
```

How it works:

- `at` absent means the Head; `'init'` the app right after init; an entry
  id the Step right after it, else a `StepNotFound` naming those kept.
- `snapshot` folds a large value to its first levels and items unless
  `expand`; a path that is not there fails, listing the keys there are.
- `watch` streams `Now` at once and after every change the app reports.
- `page` streams the page the app runs in at once, and again each time it moves to another; DevTools follows it to keep the listed page current.

### Show the Inspector beside the app

```tsx
import { KabukiInspector } from '@kestack/devtools-kabuki/inspector';

function Devtools() {
  const runtime = App.useRuntime();
  return runtime && <KabukiInspector runtime={runtime} overlay />;
}
```

```css
@import '@kestack/web-platform/ui/theme/global.css';
@import '@kestack/devtools-kabuki/inspector/sources.css';
```

How it works:

- Every Instance is a card on a canvas to pan and zoom, over a Timeline of
  every Step. With Travel the app on, as `defaultTravel` says at first, a
  Step picked Time Travels the app and Fork carries on from it.
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
