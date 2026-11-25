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
- **FakeWorld**: an app's Fakes together. It gives one Layer of every Edge,
  every Fake's state as it changes, and a way to run any Fake's controls.

A swap with nothing to control (memory or IndexedDB tables for SQLite, an
in-process Transport for a socket) is a driver, not a Fake.

## Rules

1. Fake the Edges, run the Middle. Never write the Middle twice.
2. The Middle takes its Edges from outside; a `node.ts` beside it composes
   the real ones.
3. A fake lives beside the Service it fakes, in a `fake/` folder, exported
   as `<package>/<service>/fake`. Fix it once, and every app has the fix.
4. Few Fakes, human-sized. A Fake knows only its own state, and Fakes never
   call each other. A fake Edge may use another Edge's key (fake Git reads
   the File System).
5. A control changes the state, or says in plain words why it cannot; the
   app decides whether it notices. Fakes start blank, and controls make the
   world.
6. Two modes only: **real** and **fake**. Fake code is imported lazily, and
   a production build refuses any bundle carrying it.

## The shape of a Fake

A Fake is `Fake.make` from
[`@kestack/kabuki/fake`](../packages/kabuki/README.md), in plain Effect: no
Actor, no DevTools, no RPC.

```ts
// @kestack/web-platform/pwa/fake
export const newBuild = Fake.make({
  name: 'newBuild',
  state: NewBuildState, // the facts it knows, as a Schema
  initial: { newer: false }, // where it starts
  controls: {
    PutOutNewerBuild: Fake.control(
      NewBuildState,
      Schema.Struct({}), // its payload
      (_, state) => SubscriptionRef.set(state, { newer: true }),
    ),
  },
  layer: outdatedOver, // the Edge, built over the state
});
```

- `state` and each control's payload are Schemas, so DevTools can show the
  state and build a form for each control. Name them in plain words.
- `layer` gets the state as a `SubscriptionRef`: it reads it and watches it
  change. A control fails with a string a person can read.
- A Fake holds no state itself; its FakeWorld makes it.

## Where the Fakes live

| Fake       | Export                             | Edges                                                    |
| ---------- | ---------------------------------- | -------------------------------------------------------- |
| Sign-in    | `@kestack/auth-toolkit/fake`       | `Accounts` (a Fake Account per email)                    |
| Computers  | `@kestack/connect/fake`            | `Computers` (each computer with its File System and Git) |
| Agent      | `@kestack/ai-toolkit/harness/fake` | `Harnesses`, `OneShotPrompt`, `HarnessHost`, `Models`    |
| Speech     | `@kestack/ai-toolkit/speech/fake`  | `Speech`                                                 |
| New build  | `@kestack/web-platform/pwa/fake`   | `OnOutdated`                                             |
| Microphone | Code's `voice/recorder/fake/`      | `Recorder`                                               |

`@kestack/connect/browser` runs the Middle in the tab (`inTab`) over them.
An app's own wiring is one file, Code's `src/fake.ts`.

## The FakeWorld keeps nothing

`FakeWorld.make([signIn, computers, …])` puts an app's Fakes together, each
name once. The app provides `world.layer` under its root Layer, in place of
the real Edges. Each build of that Layer starts every Fake from its
`initial` (or from `start`), and the world ends with the build's Scope.
Nothing is saved: a reload starts every Fake afresh. What an app keeps
across a reload (Code's Middle tables in `code:fake-middle`, its own
databases) is kept in IndexedDB as in real mode.

## Driving it from DevTools

The page shows no controls of its own. Give the FakeWorld to
[`@kestack/devtools-kabuki`](../devtools/devtools-kabuki/README.md)
(`KabukiDevtools` and `connect`, each with `world`), and the Inspector
drives it, beside the app or in DevTools:

- The **World** tab shows each Fake's state now and a form per control;
  running one calls `world.control` and says done or why not. Over the
  socket it is the `control` call, so an agent or the CLI runs controls the
  same way.
- An open card's **Actions** Send any Message its Actor takes to that app
  Instance, for what the Fakes do not reach.
- Time Travel rewinds the app only: the Fakes and the Middle keep their
  state, as a real server does.

## The production check

Every fake module carries the mark `kestack-fake` in its code (a log line
its Layer writes). The Web Platform's `noFake`
(`platforms/web-platform/src/app/no-fake/`) fails a production build any of
whose chunks carries the mark, a lazy one too. It cannot be turned off, so
an app imports its fake wiring only behind `import.meta.env.DEV` and its
fake mode flag, and a production build drops it.

## Running Code

```sh
pnpm --filter code dev           # fake mode: the whole app in the tab, over its Fakes
pnpm --filter code dev:connect   # real mode: this branch's Connect, signed in through the Auth Worker
```

In fake mode, open the Inspector (the corner button, or Ctrl+/), and in its
World tab run `signIn`'s `SignInAs`, then `computers`' `AddComputer`,
signed in as the same email.

## Limits

- **One tab.** Each tab runs its own Middle over the same IndexedDB, so
  fake mode is one tab at a time.
- **A reload starts the world again.** The Fakes keep nothing, so a reload
  signs out and removes every computer.
- **No install or offline App Shell.** A dev build has no service worker;
  the New build fake stands in for the update flow only.
- **One Release.** Both sides run the same build, so version gaps between
  Code and a Connection cannot be shown.
- **Agent replies are recordings.** Each reply replays a Turn recorded from
  the real Claude Code or Codex, picked at random. A replay never pauses,
  so an Agent asks no questions and starts no Background Jobs, and what the
  recorded run wrote to disk does not reach the fake file system.
