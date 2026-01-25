import { Effect } from "effect";

export const makePinger = Effect.fnUntraced(function* <A, E, R>(
  writePing: Effect.Effect<A, E, R>,
) {
  let recievedPong = true;
  const latch = Effect.unsafeMakeLatch();
  const reset = () => {
    recievedPong = true;
    latch.unsafeClose();
  };
  const onPong = () => {
    recievedPong = true;
  };
  yield* Effect.suspend(() => {
    if (!recievedPong) return latch.open;
    recievedPong = false;
    return writePing;
  }).pipe(
    Effect.delay("10 seconds"),
    Effect.ignore,
    Effect.forever,
    Effect.interruptible,
    Effect.forkScoped,
  );
  return { timeout: latch.await, reset, onPong } as const;
});
