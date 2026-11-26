# @kestack/devtools-kabuki

Kabuki apps in DevTools: the Inspector, a panel that reads and moves a running app through one Kabuki Session's eight calls, answered in the page or through the DevTools Server

## Big picture

A [Kabuki](../../packages/kabuki/README.md) app keeps everything it did in
its History, but only the tab it runs in has the Actors' code to replay it.
This package lets the tab answer for itself. Everything a DevTools panel
asks of a running app is eight calls behind one Service, `KabukiSession`:
the Blueprint, a stream of the History and where the app is, the Instances
at any Step, Seeking a Step, Forking, Sending a Message, a stream of the
app's Fakes, and running a control on one. The tab reads Kabuki only
through its public surface: the Blueprint, the History and its Branches,
the Snapshot after any entry, the Runtime's Workers and Addresses.

The calls are answered two ways. In the page, `KabukiSession` is built
straight on the app and its FakeWorld, with nothing serialized and no
server. Through DevTools, the app dials the DevTools Server and serves the
same calls over that socket, and DevTools passes each call from its own
page or CLI to the tab over the same RPC group. Why the app serves and
DevTools asks is in
[ADR 0001](./docs/adr/0001-the-app-serves-devtools-calls.md).

The Inspector is the panel that shows it, a Kabuki app of its own that
reads and moves the app only through `KabukiSession`. Its Running tab is
the app's Instances at the Step shown, each a card on a canvas to pan and
zoom, over the Timeline of every Step on the Branch in view: picking a
Step Time Travels the app, Now goes back to the Head, and Fork carries on
from the Step shown on a new Branch. An open card shows its Instance's
State, Model, Props and Workers, and its Actions: every Message its Actor
takes in the State it is in, each a form built from the Message's Shape,
Sent to the app with what came of it. Its Blueprint tab is every Actor the
root can grow, running or not. Its World tab, there only while the app has
Fakes, is each Fake's controls beside its state now: a control's form, built
from its payload's Shape, runs it on the FakeWorld and says done or why not.

The package has two doors. `./app` is for the app: `connect`, an
Attachment that dials DevTools, and the Inspector beside the app in its
own page, bare, in the Web Platform's Dock, or in its Dialog over an app
the Dock cannot lay out. `./devtools` is for the
DevTools app and Server: the Inspector to place as a Child, the routes,
`remote` for one live Kabuki Session, the live list, and the Schemas and
errors of the calls. The Fakes are
[`@kestack/kabuki/fake`](../../packages/kabuki/README.md)'s: a FakeWorld
given to `connect` is shown and driven through `fakes` and `control`.
The words used here (Kabuki Session, Environment, the eight calls, Shape,
Attachment, Inspector, Actions) are defined in [CONTEXT.md](./CONTEXT.md).

## Install

```sh
pnpm add @kestack/devtools-kabuki
```

Peer dependencies:

- `@kestack/kabuki`: the app whose History, Snapshots and FakeWorld are answered.
- `effect` (`^4.1.5`): the calls are Effects and Streams, served as an
  Effect RPC group with Effect's socket protocol.
- `@kestack/web-platform`, `react`, `react-dom`: what the Inspector is
  drawn with, the Dock or Dialog `KabukiDevtools` puts it in, and the Theme whose
  classes `./inspector/sources.css` hands an app's Tailwind.

## Exports

### `@kestack/devtools-kabuki/app`

The app's side.

| Export            | What it does                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect`         | An Attachment that connects the app to the DevTools Server as a Kabuki Session and answers its eight calls there, with its FakeWorld when given one, or a function that loads it. |
| `KabukiInspector` | The Inspector beside a running app in the same page, its Kabuki Session answered in the page by that app and its FakeWorld when given one, or a function that loads it.           |
| `KabukiDevtools`  | The Inspector beside the app, its code loaded the first time it opens: the app wrapped in the Web Platform's Dock, or with `form="dialog"` left untouched beside its Dialog.      |

### `@kestack/devtools-kabuki/devtools`

The DevTools side: its Server's routes, and the calls of any live Kabuki
Session through it. It needs only `effect`, so its clients run in a browser
too.

| Export                  | What it does                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Inspector`             | The Inspector's root Actor, to place as a Child with a `KabukiSession` Provided, as DevTools does with `remote`.                                              |
| `InspectorView`         | The Inspector's View, to draw where its Child is placed.                                                                                                      |
| `KabukiSession`         | The Service of one Kabuki Session's eight calls: `blueprint`, `watch`, `look`, `travel`, `fork`, `send`, `fakes`, `control`.                                  |
| `remote`                | The `KabukiSession` Layer of one live Kabuki Session, by name, through a DevTools Server's `/kabuki/session/:name`.                                           |
| `dialSessions`          | A client of the live Kabuki Sessions, `list` and `watch`, through a DevTools Server's `/kabuki/sessions`.                                                     |
| `kabukiRoutes`          | The Layer of routes a DevTools Server mounts on its HttpRouter: `/kabuki/connect`, `/kabuki/sessions`, `/kabuki/session/:name`, and the `kabuki_*` MCP tools. |
| `CONNECT_PATH`          | The DevTools Server path a Kabuki Session dials, `/kabuki/connect`.                                                                                           |
| `KabukiSessionSummary`  | The Schema of a live Kabuki Session as listed: name, app, Environment, page, origin, when it connected.                                                       |
| `KabukiSessionNotFound` | The error for a name no live Kabuki Session has; lists those that are.                                                                                        |
| `grouped`               | Kabuki Sessions by app, A to Z, then Environment, this computer's first: how DevTools' page and CLI list them.                                                |
| `isLocalEnvironment`    | Whether an Environment is a host on this computer, as `localhost:5173`.                                                                                       |
| `StepNotFound`          | The error for a Step no longer kept; says the oldest and newest kept.                                                                                         |
| `InstanceNotFound`      | The error for an Address no Instance has; lists the Instances there are.                                                                                      |
| `MessageRefused`        | The error for a Message its Instance's Actor does not take, or its Schema refuses; says why.                                                                  |
| `Seeking`               | The error for a Message Sent while the app Seeks a past Step: go back to now to send.                                                                         |
| `ControlRefused`        | The error for a control the FakeWorld would not run: no FakeWorld, no such Fake or control, a payload refused, or its own reason.                             |

### `@kestack/devtools-kabuki/inspector/sources.css`

| Export        | What it does                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `sources.css` | A Tailwind `@source` for the classes of this package's panel, to `@import` beside the Web Platform Theme. |

## Usage

### Inspect an app in its page, and connect it to DevTools

Wrap the app in `KabukiDevtools`: its button in the bottom-right corner,
or Ctrl+/, opens the Inspector beside the app, answered in the page. Attach
`connect` to the app as well, and each time Kabuki starts it in a browser
it dials DevTools and answers its eight calls there until the app stops.
Given the app's FakeWorld, both show each Fake and run its controls. This
is how code, this monorepo's app, places them while developing.

```tsx
import type { ReactNode } from 'react';
import { FakeWorld } from '@kestack/kabuki/fake';
import { Start } from '@kestack/kabuki/start';
import { KabukiDevtools, connect } from '@kestack/devtools-kabuki/app';

const world = FakeWorld.make([newBuild, computers]);

export function Devtools({ children }: { readonly children: ReactNode }) {
  return (
    <KabukiDevtools
      runtime={Start.useRuntime()}
      world={world}
      storageKey="shop:devtools"
      onPhones={false}
    >
      {children}
    </KabukiDevtools>
  );
}

export default Start.app({
  router: App.router,
  view: App.view,
  name: 'shop',
  document: document({ around: (app) => <Devtools>{app}</Devtools> }),
  layer: world.layer,
  attach: [connect({ world, environment: 'staging' })],
});
```

How it works:

- The Inspector is its own Kabuki app, one per app inspected, named after
  it and keeping no History of its own; nothing of it is in the app's.
  Full screen over the app it is frosted glass. `KabukiInspector` is the
  bare panel, to place anywhere: `presenting` draws only the canvas, kept
  whole in view, and `timelineAt: 'top'` puts the Timeline over it.
- A Step picked Time Travels the app, read only until Now; an open card's
  Actions then offer only to go back to now, since a Message is Sent at
  the Head. A Message Sent says `handled`, `ignored`, `queued`, `refused`
  with its reason, or why it was not sent.
- With the app's FakeWorld, the Inspector has a World tab: each Fake's
  controls beside its state now. A control with nothing to fill in is one
  Run button; the others open a form, and Enter runs it. Done or the
  reason it was refused shows beside the control, and a Fake's card flashes
  as its state changes.
- `world` may be a function that loads the FakeWorld, such as
  `() => import('./fake.ts').then((fake) => fake.world)` behind a check
  that the app runs its fakes, so a build that never does carries none of
  them: code passes its own so.
- `form="dialog"` leaves the app as it is and puts the Dialog beside it:
  the same button and keys open the Inspector full screen over the app, and
  Escape closes it. For an app the Dock cannot lay out, such as one fixed
  to the screen.
- With no `url`, `connect` dials `/__devtools` on the page's own origin, whose
  `/kabuki/connect` the Web Platform's `app()` pipes to the DevTools Server
  under `vite dev`, so a tunnel to the app reaches DevTools too. Elsewhere,
  give the whole URL: `connect({ url: 'wss://devtools.example.com' })`.
- DevTools lists it under its app, then its Environment: `environment`
  when given, else the page's host, else `default`.
- The name asked for is the page's `?kabuki-session`, else `name`, else the
  one this tab used before, else a readable one such as `quiet-otter`.
  DevTools answers the final one, `quiet-otter-2` on a clash, and the tab
  dials with it from then on, while keeping the one it asked for.
- While DevTools is down or restarting the app dials again, from half a
  second up to every ten seconds. Nothing reaches the app: with no
  WebSocket, as on a server, it does nothing.

### Call a live Kabuki Session through DevTools

`remote` gives the `KabukiSession` of one live Kabuki Session by name, the
same eight calls the page answers. This is lifted from the test that
connects an app through a real DevTools Server socket.

```ts
import { Effect, Stream } from 'effect';
import {
  KabukiSession,
  dialSessions,
  remote,
} from '@kestack/devtools-kabuki/devtools';

const origin = 'http://127.0.0.1:14400';

const program = Effect.gen(function* () {
  const session = yield* KabukiSession;
  const { root } = yield* session.blueprint();
  const now = yield* session.watch().pipe(Stream.runHead);
  const look = yield* session.look({ open: ['Diary'] });
  yield* session.send({
    to: 'Diary',
    message: {
      _tag: 'Wrote',
      note: { at: '2026-11-25T00:00:00.000Z', text: 'second' },
    },
  });
  yield* session.travel({ to: 'start' });
  yield* session.travel({ to: null });
  yield* session.fork({ from: 'start' });
  yield* session.control({
    fake: 'lights',
    control: 'Switched',
    payload: { on: true },
  });
}).pipe(Effect.provide(remote(origin, 'diary')));

const live = Effect.flatMap(dialSessions(origin), (sessions) =>
  sessions.list(),
);
```

How it works:

- `blueprint()` is every Actor the root can grow, one node per Child slot
  by its place, running or not: each level's Messages, each with a Shape of
  its payload, its Workers, Children and their Condition, Queries and
  Provides; the Actor's Requires, and Shapes of its Model, Props and each
  State's data.
- `watch()` streams, at once and after every change, `now` (the Head, the
  Step the app Seeks or `null`, running or stopped, the last failure, the
  page's URL) and every entry the History keeps, on every Branch: id,
  parent, Address, tag, Source, Time and outcome.
- `look({ at, open })` is the Instances at a Step (absent: the Head; `'start'`:
  the History's start), each with its Address, place, Actor, State tag,
  whether that Step started or changed it, and its Children. For each
  Address in `open`, its State, Model and Props encoded by its Actor's
  Schemas, large values folded, and its Workers, known only at the Head of
  a running app.
- `travel({ to })` Seeks a Step; `null` goes back to the Head. `fork({ from })`
  moves the History's Head to a Step, so the next Message grows a new Branch.
- `send({ to, message })` decodes the Message by its Actor's Schema and Sends
  it from `{ kind: 'outside', name: 'devtools' }`. It answers what Kabuki's
  send did (`handled`, `ignored`, `queued`, `refused`), or fails with
  `InstanceNotFound`, `MessageRefused` or `Seeking`.
- `fakes()` streams each Fake of the FakeWorld: its name, a Shape of its
  state, its state encoded and its controls with a Shape of each payload;
  none without a FakeWorld. `control` runs `world.control` and answers
  `'done'`, or `ControlRefused` with the reason.
- A call made before the app has its Runtime waits for it. A Step no longer
  kept fails with `StepNotFound`, naming the oldest and newest kept.
- Every call can also fail with `RpcClientError` once the socket closes;
  in the page none does.

### Serve the Kabuki routes on a DevTools Server

`kabukiRoutes` is every Kabuki route, sharing one registry of the live
Kabuki Sessions; mount it with the Server's other routes.

```ts
import { createServer } from 'node:http';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { kabukiRoutes } from '@kestack/devtools-kabuki/devtools';

const server = HttpRouter.serve(
  kabukiRoutes({ origins: ['http://127.0.0.1:14400'] }),
).pipe(
  Layer.provide(
    NodeHttpServer.layer(createServer, {
      port: 14400,
      disablePreemptiveShutdown: true,
    }),
  ),
);
```

How it works:

- `/kabuki/connect` takes any origin, and records it. A Kabuki Session is
  kept while its socket is open, under a name unique among the live ones,
  and follows the page it moves to.
- `/kabuki/sessions` and `/kabuki/session/:name` read and move tabs, so
  they answer only a request with no `Origin`, as from the CLI, or with one
  of `origins`. A name no live Kabuki Session has answers 404 with
  `KabukiSessionNotFound`.
- `/kabuki/session/:name` answers the same RPC group the tab serves, each
  call passed to the tab; its socket closes once the Kabuki Session is gone.
- The Server going down leaves the list as it was: its watchers never see
  the Kabuki Sessions leave one by one.
- It also registers the `kabuki_*` MCP tools, each a Kabuki Session's call
  by name, on the server's `McpServer` from `effect/ai`; they reach a tab
  through the same registry. With no `McpServer.layerHttp` mounted beside
  it, the tools are registered and nothing serves them.
