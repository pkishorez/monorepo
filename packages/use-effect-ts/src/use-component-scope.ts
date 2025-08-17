import { Effect, Exit, Scope } from 'effect';
import { useEffect, useState } from 'react';

export function useComponentScope(
  setup?: (scope: Scope.CloseableScope) => void,
): Scope.CloseableScope | undefined {
  const [scope, setScope] = useState<Scope.CloseableScope>();

  useEffect(() => {
    const s = Effect.runSync(Scope.make());
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setScope(s);
    setup?.(s);

    return () => {
      void Effect.runPromise(Scope.close(s, Exit.void));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return scope;
}
