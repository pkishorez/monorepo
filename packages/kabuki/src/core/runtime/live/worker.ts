import { Cause, Effect, Exit } from 'effect';
import type { Scope } from 'effect';
import type { Data, Tagged, WorkerDefinition } from '../../actor/index.ts';
import { wanted } from '../../snapshot/index.ts';
import { stopped } from './host.ts';
import type { AnySelf, Own } from './host.ts';
import type { WorkerStatus } from './work.ts';

/*
 * Workers: work that runs for exactly as long as its Condition holds. Each
 * time its Instance's data changes, every Worker's Condition names the keys
 * that should run: a key that appeared starts one, a key that went stops
 * one, a key that stayed is left alone. One waits for the Capabilities
 * above it before it runs, and says what it is doing as it goes.
 */

interface Running {
  readonly status: () => WorkerStatus;
  readonly stop: () => void;
}

export const makeWorkers = (
  definitions: Readonly<Record<string, WorkerDefinition>>,
  own: Own,
  scope: Scope.Scope,
) => {
  const running = new Map<string, Map<string, Running>>(
    Object.keys(definitions).map((name) => [name, new Map()]),
  );

  const start = (name: string, worker: WorkerDefinition, key: string) => {
    const label = key === '' ? name : `${name}#${key}`;
    let closing = false;
    let status: WorkerStatus = {
      name,
      key,
      status: 'waiting',
      since: own.now(),
    };
    const self: AnySelf = {
      ...own.self,
      send: (message) =>
        Effect.suspend(() =>
          closing
            ? Effect.die(
                new Error(
                  `[@kestack/kabuki] Worker ${label} of ${own.address} sent a Message after it stopped. Finalizers may not send.`,
                ),
              )
            : own.self.send(message),
        ),
    };
    const ended = (exit: Exit.Exit<unknown>) =>
      Effect.sync(() => {
        closing = true;
        status =
          Exit.isFailure(exit) && !stopped(exit.cause)
            ? {
                ...status,
                status: 'failed',
                failure: Cause.pretty(exit.cause),
              }
            : { ...status, status: 'finished' };
      });
    const fiber = own.fork(
      scope,
      `worker ${label}`,
      {
        kind: 'worker',
        instance: own.address,
        name,
        ...(key === '' ? {} : { key }),
      },
      Effect.suspend(() => {
        status = { name, key, status: 'running', since: own.now() };
        return Effect.scoped(
          (worker.run(self, key) as Effect.Effect<unknown, never>).pipe(
            Effect.onExit(ended),
          ),
        );
      }),
    );
    return {
      status: () => status,
      stop: () => {
        closing = true;
        fiber.interruptUnsafe();
      },
    };
  };

  return {
    /** Start the Workers whose keys appeared, and stop those whose keys went. */
    sync: (data: Data<unknown, Tagged, unknown>) => {
      for (const [name, keys] of wanted(definitions, data)) {
        const asked = new Set(keys);
        const live = running.get(name)!;
        for (const [key, each] of live)
          if (!asked.has(key)) {
            each.stop();
            live.delete(key);
          }
        for (const key of asked)
          if (!live.has(key))
            live.set(key, start(name, definitions[name]!, key));
      }
    },
    statuses: (): ReadonlyArray<WorkerStatus> =>
      [...running].flatMap(([, live]) =>
        [...live.values()].map((each) => each.status()),
      ),
  };
};
