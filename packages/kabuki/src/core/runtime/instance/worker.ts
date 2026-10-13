import { Effect, Exit } from 'effect';
import type { Scope } from 'effect';
import type { Data, Tagged, WorkerDefinition } from '../../actor/index.ts';
import { stopped } from './self.ts';
import type { AnySelf, Own } from './self.ts';

/*
 * Workers: work that runs for exactly as long as its Condition holds. Each
 * time its Instance's data changes, every Worker's Condition names the keys
 * that should run: a key that appeared starts one, a key that went stops
 * one, a key that stayed is left alone.
 */

/** What a Worker is doing, live. */
export interface WorkerStatus {
  readonly name: string;
  /** The key it runs for; `''` for the one Worker of a kind other than `each`. */
  readonly key: string;
  readonly status: 'running' | 'finished' | 'failed';
}

interface Running {
  readonly status: () => WorkerStatus['status'];
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
    let status: WorkerStatus['status'] = 'running';
    const self: AnySelf = {
      ...own.self,
      send: (message) =>
        Effect.suspend(() =>
          closing
            ? Effect.die(
                new Error(
                  `[@kstackz/kabuki] Worker ${label} of ${own.self.id} sent a Message after it stopped. Finalizers may not send.`,
                ),
              )
            : own.self.send(message),
        ),
    };
    const ended = (exit: Exit.Exit<unknown>) =>
      Effect.sync(() => {
        closing = true;
        status =
          Exit.isFailure(exit) && !stopped(exit.cause) ? 'failed' : 'finished';
      });
    const fiber = own.fork(
      scope,
      `worker ${label}`,
      {
        kind: 'worker',
        instance: own.self.id,
        name,
        ...(key === '' ? {} : { key }),
      },
      Effect.scoped(
        (worker.run(self, key) as Effect.Effect<unknown, never>).pipe(
          Effect.onExit(ended),
        ),
      ),
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
      for (const [name, worker] of Object.entries(definitions)) {
        const wanted = new Set(worker.keys(data));
        const live = running.get(name)!;
        for (const [key, each] of live)
          if (!wanted.has(key)) {
            each.stop();
            live.delete(key);
          }
        for (const key of wanted)
          if (!live.has(key)) live.set(key, start(name, worker, key));
      }
    },
    statuses: (): ReadonlyArray<WorkerStatus> =>
      [...running].flatMap(([name, live]) =>
        [...live].map(([key, each]) => ({ name, key, status: each.status() })),
      ),
  };
};
