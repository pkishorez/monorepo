import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Stream from 'effect/Stream';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { useCallback, useSyncExternalStore } from 'react';

/** The ref's current value, re-rendering on change; `fallback` during SSR, hydration and before the ref exists. */
export const useSubscriptionRef = <A>(
  ref: SubscriptionRef.SubscriptionRef<A> | undefined,
  fallback: A,
): A => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (ref === undefined) return () => {};
      const fiber = Effect.runFork(
        Stream.runForEach(SubscriptionRef.changes(ref), () =>
          Effect.sync(onChange),
        ),
      );
      return () => void Effect.runFork(Fiber.interrupt(fiber));
    },
    [ref],
  );
  return useSyncExternalStore(
    subscribe,
    () => (ref === undefined ? fallback : SubscriptionRef.getUnsafe(ref)),
    () => fallback,
  );
};
