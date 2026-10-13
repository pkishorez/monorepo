# An app is saved as its Log, and drawn before it runs

Partly superseded by [ADR 0025](0025-the-runtime-starts-from-a-history.md): an app is saved as its History, `history.save()`, its entries and its Head only, not a `RuntimeState`; whether it runs and what it shows are not saved. Each value in it is its Schema's encoded side, so plain JSON when that side is JSON-safe. Drawing before it runs stands.

The one thing an app is saved as, given back to, and drawn from before any Runtime exists is its Log, a `RuntimeState`: the entries, the Head, whether it was running and what it was showing. A lighter save is still a Log: one Restore, a Message to the root that replaces the whole Snapshot with a saved one, right after init. `toReact` draws the Log's Step on the first render, with no Log synchronously from init, with a Log through Suspense so a long Branch Replays without freezing the page, and a server or a static build renders the same HTML the client hydrates. The Runtime starts only in a browser, after that first draw, and carries on as the Log says. When the last mount closes, the Log is left in a registry on `globalThis` under the app's name, so the next mount of that name, the same component or a new one from a hot reload, Replays it through whatever code is current.

The reason is that Replay already is the whole story of loading an app: init, then Messages, through Update alone. A Snapshot given directly would be a second way in, with its own answers to Time, to the first Step, to what Time Travel can reach, and to code that has changed since. As a Restore inside the Log it gets all of those for free: its Time is the entry's, init is still the floor, the Timeline shows it, and a stale one is a divergence like any other, warned and skipped, never a crash.

## Considered Options

- **Keep the first render `null` until the Runtime starts, and leave SSR off**: rejected. Init is pure and Views never see Capabilities, so the first draw never needed the Runtime; the `null` was only the mount effect's shape. Every route that mounted an app had `ssr: false` for it.
- **A synchronous fold for the first draw, Suspense for nothing**: rejected. It is a second Replay to keep in step with the yielding one, and a long Log blocks the page in exactly the case where the user is waiting on it.
- **A Snapshot as a second kind of seed, beside the Log**: rejected. See above. It was the design for a round, until the question "what does `clear` go back to?" had two defensible answers.
- **Running Workers and Commands on the server, to render what they produce**: rejected. The server draws a Step; Workers belong to a live Instance with a Time that is moving. Per-request root Input is left out for the same reason, for now.
- **Keep the surviving Log in `import.meta.hot.data`**: rejected. It ties the package to Vite and does not work through the built `dist`. `globalThis` under the app's name works everywhere, and a server never writes it since no mount happens there.
- **Key the registry by the root Actor's name only**: amended. The docs mount four apps whose roots are all called `Rocket` or `Fleet`; `toReact` takes a `name`, the Actor's by default, and two apps of one name mounted at once is a console error.

## Consequences

- `AppOptions` is `{ saved?, name? }`. `useRuntime` reads the saved Log before the Runtime, so devtools render on the server too; `running` is false there.
- A Send before the Runtime starts is dropped, like one to a stopped app.
- `Source.kind` gains `restore`. `Replay.fold` and `Replay.restored` are exported; the Runtime takes a `replay` to share what was played for the first draw.
- Where the Log is stored between page loads is the app's business; the package only guarantees `RuntimeState`, Messages included, is plain JSON.
