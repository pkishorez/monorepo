import { Effect, FiberHandle, Scope } from 'effect';
import { useCallback, useRef } from 'react';
import { useLazyScope } from './use-lazy-scope.js';

/** Runs `fn` as a fiber owned by the component; a new run interrupts the previous one. */
export function useRunEffectLatest<Args extends any[], A, E>(
  fn: (...args: Args) => Effect.Effect<A, E, never>,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const handle = useLazyScope((scope) =>
    Effect.runSync(FiberHandle.make().pipe(Scope.provide(scope))),
  );
  return useCallback(
    (...args: Args) =>
      Effect.runPromiseExit(FiberHandle.run(handle(), fnRef.current(...args))),
    [handle],
  );
}
