import { Effect, Exit, Scope } from 'effect';
import { useEffect, useState } from 'react';

export function useComponentScope(
  setup?: (scope: Scope.Closeable) => void,
): Scope.Closeable | undefined {
  const [scope, setScope] = useState<Scope.Closeable>();

  useEffect(() => {
    const s = Effect.runSync(Scope.make());
    setScope(s);
    setup?.(s);

    return () => {
      void Effect.runPromise(Scope.close(s, Exit.void));
    };
  }, []);

  return scope;
}
