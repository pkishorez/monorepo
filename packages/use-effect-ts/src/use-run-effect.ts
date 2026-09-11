import { Effect, FiberSet, Scope } from 'effect';
import { useCallback, useRef } from 'react';
import { useLazyScope } from './use-lazy-scope.js';

/** Runs `fn` as a fiber owned by the component; every run is interrupted on unmount. */
export function useRunEffect<Args extends any[], A, E>(
  fn: (...args: Args) => Effect.Effect<A, E, never>,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const fibers = useLazyScope((scope) =>
    Effect.runSync(FiberSet.make().pipe(Scope.provide(scope))),
  );
  return useCallback(
    (...args: Args) =>
      Effect.runPromiseExit(FiberSet.run(fibers(), fnRef.current(...args))),
    [fibers],
  );
}
