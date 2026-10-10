# Managed resource layer

Status: works, with the engine held by a Capability, since a State could not
Provide a resource that an Effect builds when it was written (now it can).

## What was ported

Foldkit's `managed-resource-layer`: start an engine built from a Layer (with
a teardown), compute squares on it, stop it.

```
EnginePanel (root)            requires EngineHost (from the Layer)
  Off
  On { engineId | null }      Lifetime: EngineHost.boot → StartedEngine | FailedStartEngine
                              Provides Engine
  └─ calculator: Calculator   requires Engine; Model { computeCount, result }
                              ClickedCompute → Command: Engine.square → CompletedCompute | SkippedCompute
  Failed { reason }
engine-host/   EngineHost Capability: builds engineLayer in the Lifetime's scope and keeps the engine
calculator/    Calculator Actor and its View, and the Engine Capability it requires
```

Leaving On interrupts its Lifetime, which closes the scope the engine's
Layer was built in: its finalizer logs `Tore down engine-…`, as in Foldkit.

## Deviations

- **Booting and Ready are one State**, `On`, with `engineId: null` while
  booting. Two States would be two Lifetimes, and the engine would be torn
  down on the Transition between them.
- **The Calculator lives only while the engine is on**, so its count starts
  again after a restart (Foldkit keeps it in the root Model). The View draws
  it only once the engine is ready, which is how Compute is "disabled" while
  booting. Stopping the engine interrupts a square in flight.
- Booting waits 600 ms so the Booting status can be seen.
- `crypto.randomUUID()` instead of Effect's `Crypto` with `BrowserCrypto`.
- No `StoppedEngine` Message: a Lifetime cannot send once it is interrupted.

## Blockers

- **Resolved: a State cannot Provide a Capability that an Effect builds.**
  `provides` is now a Layer per State, built once on entering it and torn
  down on leaving it; the demo has not been moved onto it. Before: `provides` was a
  plain function of the Model and State, so the engine could not be Provided by
  On directly. EngineHost keeps it instead, and On Provides an `Engine`
  whose `square` reads the host, failing with `NotRunning` when there is none
  (Foldkit's `ResourceNotAvailable`). An API could be a scoped `provides`:
  `resources: { On: () => engineLayer }`, built on entering the State, torn
  down on leaving it, given to Commands, Lifetimes and Children below, with a
  Message for "acquired" and "failed".
- **A Lifetime belongs to exactly one State**, so a resource that spans
  Booting and Ready forces them into one State with a flag. A Lifetime keyed
  by several States (`lifetime: { 'Booting | Ready': … }`), kept while moving
  between them, would let them stay apart. (A `'*'` Lifetime now lasts the
  whole Instance, but a set of States still cannot share one.)

## Testing

Foldkit's scene clicks Start, sees "Booting engine...", then drives the
resource by hand: `ManagedResource.acquire(managedResources.engine, { engineId: 'engine-1', square })`,
`ManagedResource.release(...)` and `ManagedResource.failAcquire(..., 'Error: …')`,
checking the text after each. Stories resolve `Compute` with
`CompletedCompute({ result: 9 })`.

What Effect Oak would need:

- **A way to emit a Lifetime's Message** in a test (roll-up blocker 6): here
  that is the whole resource story, `StartedEngine` and `FailedStartEngine`.
  Today `Runtime.start` with a fake `EngineHost` Layer whose `boot` is a
  controlled Stream is the closest, as an integration test.
- Named Commands to resolve `square` (blocker 4), and a way to reach the
  Calculator Child's Handle in a test.
