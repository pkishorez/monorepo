# Stopwatch

Status: works

## What was ported

Foldkit's `stopwatch`: a `MM:SS.cc` time with Start, Stop and Reset.

```
Stopwatch        one Node
  Stopped { elapsed }            Start → Running
  Running { before, since }      Stop  → Stopped { elapsed: before + (at - since) }
  either                         Reset → Stopped { elapsed: 0 }   ('*' rule)
```

The View draws the time at each Frame with `useFrame`. While Running it is
`before + (at - since)`. While Stopped it is `elapsed`. `face.tsx` writes it into
a ref without a React render.

## Deviations

- **No ticks.** Foldkit runs a Subscription that sends `Ticked` every 10 ms.
  Each tick asks a Command to read `Clock.currentTimeMillis` and sends back
  `CompletedDetermineTickTime { elapsedMs }`: about 200 Messages a second.
  Here a minute of running is two Messages (ClickedStart, ClickedStop). The
  Message's Time (`at`) replaces both Commands that read the clock. This is
  ADR 0005 in action.
- Running and stopped are States instead of an `isRunning` flag, so Stop is
  only handled while Running and Start only while Stopped.
- Time Travel to any moment of a run shows the time at that moment, which the
  tick version can only do at 10 ms steps.

## Blockers

None.

## Testing

Foldkit's stories check that `ClickedStart` asks for
`DetermineStartTime({ elapsedMs })`. The test resolves that Command by hand
with `Command.resolve(DetermineStartTime, CompletedDetermineStartTime({ startTime: 500 }))`.
Its scenes emit a tick with `Subscription.emit(Ticked())` and check that the
text reads `00:04.32`.

There are no Commands or Lifetimes here, so the Update tests only need a typed
`Node.step` that takes `at` (see [../counter/notes.md](../counter/notes.md)).
Then "Start at 1000, Stop at 5320 → Stopped { elapsed: 4320 }" is one call.
To test what the View shows, Effect Oak would also need to draw a View at a
given Time: `View.render(StopwatchView, snapshot, { at: 5320 })`, with
`useFrame` called once at that Time. Today Frames come only from `toReact`.
