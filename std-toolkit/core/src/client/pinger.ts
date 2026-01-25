import { Effect } from "effect";

export const makePinger = Effect.fnUntraced(function* <A, E, R>(
  writePing: Effect.Effect<A, E, R>,
) {
  let receivedPong = true;
  const latch = Effect.unsafeMakeLatch();
  const reset = () => {
    receivedPong = true;
    latch.unsafeClose();
  };
  const onPong = () => {
    receivedPong = true;
  };
  yield* Effect.suspend(() => {
    if (!receivedPong) return latch.open;
    receivedPong = false;
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
