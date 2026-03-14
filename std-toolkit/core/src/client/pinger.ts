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

  yield* Effect.gen(function* () {
    while (true) {
      yield* Effect.sleep("10 seconds");
      if (receivedPong) {
        receivedPong = false;
        yield* Effect.ignore(writePing);
      } else {
        yield* latch.open;
      }
    }
  }).pipe(Effect.interruptible, Effect.forkScoped);

  return { timeout: latch.await, reset, onPong } as const;
});
