import { Effect, Fiber, FiberHandle, Scope } from 'effect';
import { useEffect, useRef } from 'react';
import { useComponentScope } from './use-component-scope.js';

export function useRunEffectQueue<Args extends any[], A, E>(
  fn: (...args: Args) => Effect.Effect<A, E, never>,
) {
  const queue = useRef<Args[]>([]);
  const scope = useComponentScope();

  const isExecuting = useRef(false);
  const runFromQueue = () => {
    const [first, ...rest] = queue.current;
    if (!scope || !first || isExecuting.current) {
      return;
    }

    queue.current = rest;
    isExecuting.current = true;
    Effect.runPromiseExit(
      Effect.gen(function* () {
        const fiberHandle = yield* FiberHandle.make().pipe(Scope.extend(scope));

        const fiber = yield* FiberHandle.run(fiberHandle)(fn(...first));

        yield* Fiber.join(fiber);
      }),
    ).finally(() => {
      isExecuting.current = false;
      runFromQueue();
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(runFromQueue, [scope]);

  return (...args: Args) => {
    queue.current.push(args);
    runFromQueue();
  };
}
