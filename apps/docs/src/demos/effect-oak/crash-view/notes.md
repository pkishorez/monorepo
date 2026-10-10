# Crash view

Status: partial. The crash panel shows, but the View catches the crash itself,
outside the Node and the Log.

## What was ported

Foldkit's `crash-view`: a Crash button whose Update throws, and a custom crash
view with the error message and a Reload button.

```
CrashDemo        one Node, one Message (ClickedCrash), Update throws
```

## What happens in Effect Oak

The Runtime handles a Message inside `send`, so an Update that throws throws
out of `send`, straight into the View's click handler. The View catches it and
keeps the error in React state, then draws `crash-panel.tsx`.

Seen in the browser:

- The Message never reaches the Log ("Messages 0"). The Log entry is recorded
  only after Update returns.
- The app keeps running. Its Model is untouched, and the next Message is
  handled as if nothing had happened. Messages already queued behind the one
  that threw wait until the next `send`.
- Time Travel to 0 s still shows the crash panel. The crash is React state in
  the View, not app state, so Replay cannot see it. The Shell's `over` cannot
  be set either, because the route cannot see the crash.
- A Command or Lifetime whose Message makes Update throw would throw inside its
  fiber. Nothing would show at all.

## Deviations

- Reload calls `location.reload()`, as Foldkit's does. The Shell's Restart also
  clears the crash, because it remounts the app.

## Blockers

**No crash handling in the Runtime.** Foldkit stops the dispatch loop when
Update, a View or a Command throws, logs the crash, calls `crash.report` with
`{ error, model, message }` and draws `crash.view` instead of the app.

What an API could look like:

```ts
const App = toReact(Node, View, layer, {
  crash: {
    view: ({ error, message, path }) => <CrashPanel error={error} />,
    report: ({ error, message, path, model, state }) => …,
  },
});
```

Inside the Runtime, a thrown Update would become a Log entry with outcome
`'crashed'` and the error. The Runtime would stop its queue, Commands and
Lifetimes, and `useRuntime` would expose that it crashed. Replay could
then stop at that Message, so Time Travel shows the app as it was just before.

## Testing

Foldkit's story test calls `update(null, ClickedCrash())` and expects it to
throw `'This is a simulated crash!'`. The scene test checks that the Crash
button exists. The crash view itself is not tested.

The throw can be tested in Effect Oak today by calling
`CrashDemo.definition.update.Single.ClickedCrash`, which is untyped. A typed
`Node.step` (see [../counter/notes.md](../counter/notes.md)) would make it one
line. Testing the crash view needs the crash hook above, plus a way to draw an
app in a test.
