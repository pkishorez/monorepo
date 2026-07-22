import { fork } from 'node:child_process';
import { Cause, Effect, Queue, Stream } from 'effect';
import { analyzeProject } from 'laymos/node';
import type { LaymosReport } from 'laymos/report';
import { DevtoolsRpcError, type LaymosEvent } from '../rpc/index.js';

/** Selects the one-shot laymos worker mode in the bundled server entrypoint. */
export const LAYMOS_DIR_ENV = 'DEVTOOLS_LAYMOS_DIR';

type WorkerMessage =
  | { type: 'result'; data: LaymosReport }
  | { type: 'error'; message: string };

const errorMessage = (cause: unknown): string => {
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'cause' in cause &&
    cause.cause !== undefined
  ) {
    return errorMessage(cause.cause);
  }
  return cause instanceof Error ? cause.message : String(cause);
};

/** Run laymos once and send its report to the parent process. */
export const runLaymosWorker = (dir: string) => {
  const post = (message: WorkerMessage, onFlushed?: () => void) => {
    if (process.send) {
      process.send(message, undefined, undefined, onFlushed);
    } else {
      onFlushed?.();
    }
  };

  void Effect.runPromise(analyzeProject(dir))
    .then((data) => {
      post({ type: 'result', data }, () => process.exit(0));
    })
    .catch((cause: unknown) => {
      post({ type: 'error', message: errorMessage(cause) }, () =>
        process.exit(1),
      );
    });
};

/** Stream liveness heartbeats followed by the terminal laymos report. */
export const runLaymosStream = (
  dir: string,
): Stream.Stream<LaymosEvent, DevtoolsRpcError> =>
  Stream.callback<LaymosEvent, DevtoolsRpcError>((queue) =>
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
          env: { ...process.env, [LAYMOS_DIR_ENV]: dir },
        });
        let settled = false;
        const heartbeat = setInterval(() => {
          Queue.offerUnsafe(queue, {
            _tag: 'Heartbeat',
            elapsedMs: elapsedMs(),
          });
        }, 1000);

        child.on('message', (message: WorkerMessage) => {
          switch (message.type) {
            case 'result':
              settled = true;
              Queue.offerUnsafe(queue, {
                _tag: 'Result',
                result: { available: true, data: message.data },
              });
              Queue.endUnsafe(queue);
              break;
            case 'error':
              settled = true;
              fail(message.message);
              break;
          }
        });
        child.on('error', (cause: Error) => {
          settled = true;
          fail(cause.message);
        });
        child.on('exit', (code) => {
          if (settled) return;
          fail(
            code === 0
              ? 'laymos worker exited without a result'
              : `laymos worker exited with code ${code}`,
          );
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
