import { Worker } from 'node:worker_threads';

import { Effect, Semaphore } from 'effect';

import type { EngineAnswer, EngineJob } from './engine-worker.js';

export type { EngineJob } from './engine-worker.js';

const workerFile = new URL(
  import.meta.url.endsWith('.ts')
    ? './engine-worker.ts'
    : './monoverse-engine.mjs',
  import.meta.url,
);

const turns = Semaphore.makeUnsafe(3);

const workers = new Set<Worker>();

export const runningEngines = (): number => workers.size;

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
