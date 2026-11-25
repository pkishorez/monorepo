import { type ChildProcess, spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Data, Effect, Schedule } from 'effect';
import { reach } from '@kestack/cli-platform/single';
import {
  isLive,
  readVideo,
  WorkerControl,
  workerSocket,
  workOf,
} from '../library/index.ts';
import { fakePipeline, type Pipeline } from './run.ts';

/*
 * A Video's worker as the CLI sees it: started as a process of its own
 * that outlives the command, stopped through its socket, and what it needs
 * on this computer checked first.
 */

/** A worker that would not start or stop. */
export class WorkerError extends Data.TaggedError('WorkerError')<{
  readonly message: string;
}> {}

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

const STARTING = '20 seconds';
const STOPPING = '30 seconds';

const logOf = (id: string) => join(workOf(id), 'worker.log');

/** The exit code of `child` once it exits. */
const exitOf = (child: ChildProcess) =>
  Effect.callback<number | null>((resume) => {
    if (child.exitCode !== null) return resume(Effect.succeed(child.exitCode));
    const onExit = (code: number | null) => resume(Effect.succeed(code));
    child.once('exit', onExit);
    return Effect.sync(() => child.off('exit', onExit));
  });

/**
 * Starts the worker of the Video `id`, detached, writing to
 * `work/worker.log`, and returns once it is live, or once it has run to its
 * end.
 */
export const start = (id: string) =>
  Effect.gen(function* () {
    const log = logOf(id);
    const child = yield* Effect.try({
      try: () => {
        mkdirSync(workOf(id), { recursive: true });
        const fd = openSync(log, 'a');
        try {
          const child = spawn(process.execPath, [MAIN, id], {
            detached: true,
            stdio: ['ignore', fd, fd],
            env: process.env,
          });
          child.unref();
          return child;
        } finally {
          closeSync(fd);
        }
      },
      catch: (cause) =>
        new WorkerError({
          message: `Could not start the worker of ${id}: ${String(cause)}`,
        }),
    });
    const live = isLive(id).pipe(
      Effect.repeat({
        until: (live) => live,
        schedule: Schedule.spaced('50 millis'),
      }),
    );
    const ended = yield* Effect.raceFirst(
      Effect.as(live, 'live' as const),
      Effect.as(exitOf(child), 'exited' as const),
    ).pipe(
      Effect.timeoutOrElse({
        duration: STARTING,
        orElse: () =>
          Effect.fail(
            new WorkerError({
              message: `The worker of ${id} did not start in ${STARTING}; its log is ${log}`,
            }),
          ),
      }),
    );
    if (ended === 'exited' && (yield* readVideo(id)).state === 'queued')
      return yield* new WorkerError({
        message: `The worker of ${id} stopped as it started; its log is ${log}`,
      });
  });

/** Stops the worker of the Video `id`, and returns once it is gone. */
export const stop = (id: string) =>
  Effect.gen(function* () {
    yield* reach(workerSocket(id), WorkerControl).pipe(
      Effect.flatMap((client) => client.stop()),
      Effect.timeout('5 seconds'),
      Effect.ignore,
      Effect.scoped,
    );
    yield* isLive(id).pipe(
      Effect.repeat({
        while: (live) => live,
        schedule: Schedule.spaced('100 millis'),
      }),
      Effect.timeoutOrElse({
        duration: STOPPING,
        orElse: () =>
          Effect.fail(
            new WorkerError({
              message: `The worker of ${id} did not stop in ${STOPPING}; its log is ${logOf(id)}`,
            }),
          ),
      }),
    );
  });

/** What the pipeline needs on this computer, each found or not. */
export const requirements = Effect.promise(async () => {
  const pipeline: Pick<
    Pipeline<never>,
    'requirements'
  > = (await fakePipeline()) ?? (await import('../pipeline/index.ts'));
  return pipeline.requirements;
}).pipe(Effect.flatten);
