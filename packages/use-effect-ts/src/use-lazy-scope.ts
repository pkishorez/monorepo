import { Effect, Exit, Scope } from 'effect';
import { useEffect, useRef } from 'react';

/**
 * A component-owned scope that exists from the first call, not from the first
 * commit. Runners built on it work inside mount effects and first-render
 * handlers; the scope closes on unmount and is recreated if React remounts.
 */
export function useLazyScope<T>(make: (scope: Scope.Closeable) => T): () => T {
  const makeRef = useRef(make);
  makeRef.current = make;
  const current = useRef<{ scope: Scope.Closeable; value: T } | null>(null);
  const ensure = () => {
    if (!current.current) {
      const scope = Effect.runSync(Scope.make());
      current.current = { scope, value: makeRef.current(scope) };
    }
    return current.current.value;
  };
  useEffect(() => {
    ensure();
    return () => {
      const owned = current.current;
      current.current = null;
      if (owned) void Effect.runPromise(Scope.close(owned.scope, Exit.void));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ensure;
}
