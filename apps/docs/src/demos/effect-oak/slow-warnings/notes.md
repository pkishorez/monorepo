# Slow warnings

Status: partial. Slow Update, View and patch work are all caught and
recorded, but by timing from the View: the Runtime reports nothing. The
fourth scenario, slow subscription dependencies, is skipped.

## What was ported

Foldkit's `slow-warnings` lab: buttons that make one part of handling a
Message slow on purpose, and a list of the warnings that came of it.

```
SlowLab (root)    one Actor; Model { activeWorkload, run, warnings, patchRows, patchRun }
                  ClickedRunUpdateWork burns 10 ms of CPU inside Update
                  RecordedSlowWarning { report } is sent by the View
timing.tsx        timedSend (times Update around send) and Timed (times a draw
                  to its layout effect)
scenarios/        Scenarios, the three cards; a drawing
warnings/         Warnings, the recorded list; a drawing
patch-surface/    PatchSurface, 4,000 keyed rows; a drawing
phases.ts         phases, thresholds and the report Schema
burn.ts           burnCpu and the workload sizes
```

It is one Actor: the warnings are recorded from the root's View, and a parent
cannot hand a Message to a Child, so a separate warnings Actor could not be
told about them.

## Deviations

- **Timed from the View, not reported by the Runtime.** Foldkit's Runtime
  calls `slow` with the phase, duration and trigger, and the app forwards it
  through an EventTarget Subscription. Here:
  - Update: `send` handles the Message before it returns, so the View times
    the call (it includes writing the Log).
  - View and Patch: `Timed` notes when it starts drawing and reads the clock
    again in its layout effect, after React has written the DOM.
    Either way the View then sends `RecordedSlowWarning`. Foldkit's thresholds
    are kept (4, 16 and 8 ms).
- **No subscription-dependencies scenario.** Effect Oak's Lifetimes start
  from a State, not from dependencies derived from the Model, so there is no
  such phase to slow down.
- Patch work is React mounting rows instead of Foldkit's VDOM patch.
- During Time Travel the past is drawn again, so View and Update work burn
  CPU again, but the past cannot send, so no new warning is recorded.

## Blockers

- **No slow-work hook.** Nothing tells an app how long an Update or a View
  took. An API could be an option on `Runtime.start` and `toReact`, like
  `{ onSlow: ({ phase, tookMs, path, message }) => … , thresholds }`, or a
  `tookMs` on each Log entry, which the Shell's Message Log could show too.
  Timing a View is React's business, so the View phase may stay in the app.

## Testing

Foldkit tests `handleSlow` on its own (it spies on `console.warn` and checks
the formatted line), its stories check that each `ClickedRun…` sets the
workload and that `RecordedSlowWarning` stores the warning and goes back to
Idle, and its scenes click "Run patch work" and count rows.

What Effect Oak would need: the typed `Actor.step` and View drawing of
roll-up blocker 5. The timing itself would need the hook above to be
testable without a real clock.
