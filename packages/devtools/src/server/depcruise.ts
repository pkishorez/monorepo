import { fork } from 'node:child_process';
import { Cause, Effect, Queue, Stream } from 'effect';
import { cruiseProject, type DepcruisePhase } from 'depcruise-viz/node';
import type { DepcruiseVizData } from 'depcruise-viz';
import { DevtoolsRpcError, type DepcruiseEvent } from '../rpc/index.js';

/**
 * When set, the server entrypoint runs as a one-shot cruise child process for
 * this directory instead of booting the CLI (see the guard in `main.ts`).
 */
export const DEPCRUISE_DIR_ENV = 'DEVTOOLS_DEPCRUISE_DIR';

type WorkerMessage =
  | { type: 'phase'; phase: DepcruisePhase }
  | { type: 'result'; data: DepcruiseVizData }
  | { type: 'error'; message: string };

const PHASE_MESSAGES: Record<DepcruisePhase, string> = {
  'load-config': 'Loading depcruise config…',
  'compile-config': 'Compiling rules…',
  cruise: 'Cruising dependencies…',
  summarize: 'Summarizing…',
};

/**
 * Child-process body for `RunDepcruise`. The bundler emits a single entry
 * file, so the server forks its own entrypoint with {@link DEPCRUISE_DIR_ENV}
 * set; a full process (unlike a worker thread) supports the `process.chdir`
 * that dependency-cruiser's resolver requires, and keeps the CPU-bound cruise
 * off the server's event loop.
 */
export const runDepcruiseWorker = (dir: string) => {
  const post = (message: WorkerMessage) => process.send?.(message);

  void cruiseProject(dir, (phase) => post({ type: 'phase', phase }))
    .then(({ config, summary }) => {
      post({ type: 'result', data: { config, summary } });
      process.exit(0);
    })
    .catch((cause: unknown) => {
      post({
        type: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
      });
      process.exit(1);
    });
};

/**
 * Stream of {@link DepcruiseEvent}s for one cruise of `dir`: forks the cruise
 * child, forwards its phase transitions as `Progress`, emits a `Heartbeat`
 * every second so clients can show liveness during the long cruise, and ends
 * with `Result`. Interrupting the stream kills the child.
 */
export const runDepcruiseStream = (
  dir: string,
): Stream.Stream<DepcruiseEvent, DevtoolsRpcError> =>
  Stream.callback<DepcruiseEvent, DevtoolsRpcError>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const startedAt = Date.now();
        const elapsedMs = () => Date.now() - startedAt;
        const fail = (message: string) =>
          Queue.failCauseUnsafe(
            queue,
            Cause.fail(new DevtoolsRpcError({ message })),
          );

        const child = fork(process.argv[1] as string, [], {
          env: { ...process.env, [DEPCRUISE_DIR_ENV]: dir },
        });
        const heartbeat = setInterval(() => {
          Queue.offerUnsafe(queue, {
            _tag: 'Heartbeat',
            elapsedMs: elapsedMs(),
          });
        }, 1000);

        child.on('message', (message: WorkerMessage) => {
          switch (message.type) {
            case 'phase':
              Queue.offerUnsafe(queue, {
                _tag: 'Progress',
                phase: message.phase,
                message: PHASE_MESSAGES[message.phase],
                elapsedMs: elapsedMs(),
              });
              break;
            case 'result':
              Queue.offerUnsafe(queue, {
                _tag: 'Result',
                result: { available: true, data: message.data },
              });
              Queue.endUnsafe(queue);
              break;
            case 'error':
              fail(message.message);
              break;
          }
        });
        child.on('error', (cause: Error) => fail(cause.message));
        child.on('exit', (code) => {
          if (code !== 0) fail(`depcruise worker exited with code ${code}`);
        });

        return { child, heartbeat };
      }),
      ({ child, heartbeat }) =>
        Effect.sync(() => {
          clearInterval(heartbeat);
          child.kill();
        }),
    ),
  );
