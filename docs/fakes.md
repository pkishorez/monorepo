# Fakes

How an app runs whole in a browser tab, its outside world faked. Code
(`apps/code`) is the first app to do so; why there are only two modes is
[ADR 0015](adr/0015-two-modes-real-and-fake.md).

## The model

- **Middle**: the real code: an app's Actors, Connect Cloud's handlers, the
  code Plugin and its Engine. In fake mode it runs in the tab, unchanged.
- **Edge**: what only the outside world has: a process, a disk, git, a
  device, a third-party server. A Service key in a browser-safe file, with a
  real version (Node-only code behind a `/node` door) and a fake.
- **Fake**: one thing of the outside world a person would name (a computer,
  a sign-in, a microphone), which gives the Layer of one or more Edges.
- **Fake World**: the flat list of Fakes an app picks. It runs each, gives
  one Layer of every Edge, and draws the bubble.

A swap with nothing to control (memory or IndexedDB tables for SQLite, an
in-process Transport for a socket) is a driver, not a Fake.

## Rules

1. Fake the Edges, run the Middle. Never write the Middle twice.
2. The Middle takes its Edges from outside; a `node.ts` beside it composes
   the real ones.
3. A fake lives beside the Service it fakes, in a `fake/` folder, exported
   as `<package>/<service>/fake`. Fix it once, and every app has the fix.
4. Few Fakes, human-sized. A Fake knows only its own state, and Fakes never
   call each other. A Fake may own child Fakes (a computer owns its File
   System), and a fake Edge may use another Edge's key (fake Git reads the
   File System).
5. `serve` is thin: it reads the Model, shapes answers and picks the Edge's
   errors; every change is a Message it sends.
6. A Control always lands; the app decides whether it notices. Fakes start
   blank, and Controls make the world.
7. Two modes only: **real** and **fake**. Fake code is imported lazily, and
   a production build refuses any bundle carrying it.

## The shape of a Fake

A Fake is a plain object. It never imports devtools-kabuki (the type is
structural), so no package depends on the bubble to fake its Edge.

```ts
// <service>/fake/index.ts
export const microphone = {
  name: 'Microphone',
  actor: MicrophoneFake, // a built Kabuki Actor: Requires nothing, starts blank
  controls: MICROPHONE_CONTROLS, // the Message tags the bubble offers
  serve: (runtime) => microphoneOver(runtime), // its Runtime → the Layer of its Edges
  kept, // optional: the Snapshot a reload keeps
};
```

- `controls` name Messages of the Actor or of any Actor below it; each
  Instance in the bubble offers the ones its Actor has. Their Schemas give
  the bubble its forms, so name Messages and fields in plain words.
- `serve` takes the running Actor (`root`, `snapshot`, `changes`, `send`)
  and is built in the Fake World's Scope.
- `kept` drops what dies with the page, as it dies with a computer's
  restart: running replies, open recordings, a download under way.

## Where the Fakes live

| Fake       | Export                             | Edges                                                    |
| ---------- | ---------------------------------- | -------------------------------------------------------- |
| Sign-in    | `@kestack/auth-toolkit/fake`       | `Accounts` (a Fake Account per email)                    |
| Computers  | `@kestack/connect/fake`            | `Computers` (each computer with its File System and Git) |
| Agent      | `@kestack/ai-toolkit/harness/fake` | `Harnesses`, `OneShotPrompt`, `HarnessHost`, `Models`    |
| Speech     | `@kestack/ai-toolkit/speech/fake`  | `Speech`                                                 |
| New build  | `@kestack/web-platform/pwa/fake`   | `OnOutdated`                                             |
| Microphone | Code's `voice/recorder/fake/`      | `Recorder`                                               |

The Fake World and the bubble are `@kestack/devtools-kabuki/fake`;
`@kestack/connect/browser` runs the Middle in the tab (`inTab`) over them.
An app's own wiring is one file, Code's `src/fake.ts`.

## The Fake World and the bubble

`FakeWorld.make(fakes, { saved })` runs each Fake (`Runtime.scoped`),
merges their Layers into `world.layer`, and keeps their Runtimes for the
bubble. The app provides `world.layer` under its root Layer, in place of the
real Edges, and draws `FakeBubble({ world })` once beside itself.

The bubble is a movable button in a Shadow DOM, so it shares no styles
with the app. Opened, it lists each Fake with its Instances, each with its
Model and a form per Control, and a log of who sent what. Kabuki DevTools
keep working on the app's own Runtime: Seek rewinds the app only, and the
Fakes and the Middle keep their state, as a real server does.

## A reload keeps the world; Start fresh

- The Fake World saves each Fake's Snapshot (or its `kept` part) to
  IndexedDB on change (`FakeWorld.indexedDb(name)`) and starts from it.
- The Middle's tables are on IndexedDB too (Code: `code:fake-middle`), and
  the app's own databases are kept as in real mode, so all three agree
  after a reload.
- **Start fresh**, in the bubble, sets a flag and reloads; the next start
  calls `FakeWorld.beforeStart()` before anything opens a database, which
  deletes every IndexedDB database, localStorage and sessionStorage.

## The production check

Every fake module carries the mark `kestack-fake` in its code (a log line
its `serve` writes, the bubble's tag). The Web Platform's `noFake`
(`platforms/web-platform/src/app/no-fake/`) fails a production build any of
whose chunks carries the mark, a lazy one too. It cannot be turned off, so
an app imports its fake wiring only behind `import.meta.env.DEV` and its
fake mode flag, and a production build drops it.

## Running Code

```sh
pnpm --filter code dev           # fake mode: the whole app in the tab, with the bubble
pnpm --filter code dev:connect   # real mode: this branch's Connect, signed in through the Auth Worker
```

In fake mode, sign in with the bubble's Sign-in "Sign in as", then add a
computer with Computers "Add computer", signed in as the same email.

## Limits

- **One tab.** Each tab runs its own Middle over the same IndexedDB, so
  fake mode is one tab at a time.
- **A reload restarts every computer.** The tab is every computer's
  `ke-connect`, so a reload starts each one again.
- **No install or offline App Shell.** A dev build has no service worker;
  the New build fake stands in for the update flow only.
- **One Release.** Both sides run the same build, so version gaps between
  Code and a Connection cannot be shown.
