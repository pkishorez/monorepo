import { fork } from 'node:child_process';
import { Cause, Effect, Option, Queue, Schema, Stream } from 'effect';
import { analyzeProject, getProjectNarrative } from 'laymos/node';
import type { LaymosReport, ProjectNarrative } from 'laymos/report';
import {
  DevtoolsRpcError,
  type LaymosProjectDocumentation,
  type OpenLaymosProjectEvent,
} from '../rpc/index.js';

/** Selects the one-shot laymos worker mode in the bundled server entrypoint. */
export const LAYMOS_DIR_ENV = 'DEVTOOLS_LAYMOS_DIR';

type WorkerMessage =
  | { type: 'project'; project?: ProjectNarrative }
  | { type: 'architecture'; architecture: LaymosReport }
  | {
      type: 'result';
      architecture: LaymosReport;
      bootstrap?: {
        documentation: LaymosProjectDocumentation;
        files: readonly string[];
      };
    }
  | { type: 'error'; message: string };

const ErrorMessageSchema = Schema.Struct({ message: Schema.String });

const errorMessage = (cause: unknown): string => {
  const decoded = Schema.decodeUnknownOption(ErrorMessageSchema)(cause);
  return Option.isSome(decoded) ? decoded.value.message : String(cause);
};

/** Runs Laymos architecture analysis once and sends it to the parent process. */
export const runLaymosWorker = (dir: string) => {
  const post = (message: WorkerMessage, onFlushed?: () => void) => {
    if (process.send) {
      process.send(message, undefined, undefined, onFlushed);
    } else {
      onFlushed?.();
    }
  };

  const architectureEffect = analyzeProject({ projectDir: dir }).pipe(
    Effect.tap((architecture) =>
      Effect.sync(() => post({ type: 'architecture', architecture })),
    ),
  );
  const projectEffect = getProjectNarrative({ projectDir: dir }).pipe(
    Effect.tap((project) =>
      Effect.sync(() =>
        post({
          type: 'project',
          ...(project === undefined ? {} : { project }),
        }),
      ),
    ),
  );
  const operation = Effect.all([projectEffect, architectureEffect], {
    concurrency: 'unbounded',
  }).pipe(
    Effect.map(([, architecture]) => ({
      architecture,
      bootstrap: {
        documentation: projectDocumentation(architecture),
        files: Object.keys(architecture.files).sort(),
      },
    })),
  );

  void Effect.runPromise(operation)
    .then((result) => {
      post({ type: 'result', ...result }, () => process.exit(0));
    })
    .catch((cause: unknown) => {
      post({ type: 'error', message: errorMessage(cause) }, () =>
        process.exit(1),
      );
    });
};

/** Opens one project's architecture and documentation model. */
export const openLaymosProjectStream = (
  dir: string,
): Stream.Stream<OpenLaymosProjectEvent, DevtoolsRpcError> =>
  Stream.callback<OpenLaymosProjectEvent, DevtoolsRpcError>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const startedAt = Date.now();
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
            elapsedMs: Date.now() - startedAt,
          });
        }, 1000);
        child.on('message', (message: WorkerMessage) => {
          if (message.type === 'error') {
            settled = true;
            fail(message.message);
            return;
          }
          if (message.type === 'architecture') {
            Queue.offerUnsafe(queue, {
              _tag: 'Architecture',
              architecture: message.architecture,
            });
            return;
          }
          if (message.type === 'project') {
            Queue.offerUnsafe(queue, {
              _tag: 'Project',
              ...(message.project === undefined
                ? {}
                : { project: message.project }),
            });
            return;
          }
          if (message.bootstrap === undefined) {
            settled = true;
            fail('Laymos worker exited without project data');
            return;
          }
          settled = true;
          Queue.offerUnsafe(queue, {
            _tag: 'Result',
            result: {
              available: true,
              data: {
                architecture: message.architecture,
                documentation: message.bootstrap.documentation,
                files: [...message.bootstrap.files],
              },
            },
          });
          Queue.endUnsafe(queue);
        });
        child.on('error', (cause: Error) => {
          settled = true;
          fail(cause.message);
        });
        child.on('exit', (code) => {
          if (settled) return;
          fail(
            code === 0
              ? 'Laymos worker exited without a result'
              : `Laymos worker exited with code ${code}`,
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

function projectDocumentation(
  architecture: LaymosReport,
): LaymosProjectDocumentation {
  return {
    modules: Object.entries(architecture.architecture.modules)
      .map(([modulePath, module]) => ({
        modulePath,
        description: module.description ?? '',
        ...(module.documentation === undefined
          ? {}
          : { documentation: module.documentation }),
      }))
      .sort((left, right) => left.modulePath.localeCompare(right.modulePath)),
  };
}
