import { Worker } from 'node:worker_threads';

import { Effect, Semaphore } from 'effect';

import type { EngineAnswer, EngineJob } from './engine-worker.js';

export type { EngineJob } from './engine-worker.js';

/*
 * Runs @kestack/monoverse's engine on a job in a worker thread of its own,
 * so the server keeps answering (Lotel, Kabuki Sessions) while a large
 * project is checked. A few run at once, the rest wait their turn, and a
 * request given up stops its worker. From source it is
 * `engine-worker.ts`; in the packaged CLI, `monoverse-engine.mjs` beside
 * it.
 */

const workerFile = new URL(
  import.meta.url.endsWith('.ts')
    ? './engine-worker.ts'
    : './monoverse-engine.mjs',
  import.meta.url,
);

/** How many engines run at once. */
const turns = Semaphore.makeUnsafe(3);

const workers = new Set<Worker>();

/** How many engines are running now. */
export const runningEngines = (): number => workers.size;

/** The engine's answer to `job`; interrupted, its worker is stopped. */
export function runEngine(
  job: EngineJob,
): Effect.Effect<Extract<EngineAnswer, { ok: true }>, Error> {
  return Semaphore.withPermit(
    turns,
    Effect.callback<Extract<EngineAnswer, { ok: true }>, Error>((resume) => {
      const worker = new Worker(workerFile, { workerData: job });
      workers.add(worker);
      let answered = false;
      const answer = (effect: Parameters<typeof resume>[0]) => {
        if (answered) return;
        answered = true;
        resume(effect);
      };
      worker.once('message', (said: EngineAnswer) =>
        answer(
          said.ok ? Effect.succeed(said) : Effect.fail(new Error(said.error)),
        ),
      );
      worker.once('error', (cause: Error) => answer(Effect.fail(cause)));
      worker.once('exit', (code) => {
        workers.delete(worker);
        answer(
          Effect.fail(
            new Error(`The engine stopped without an answer (${code}).`),
          ),
        );
      });
      return Effect.sync(() => void worker.terminate());
    }),
  );
}
