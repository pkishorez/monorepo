import { Context, Effect, Schema, Stream } from 'effect';
import {
  RunError,
  type RunnerEvent,
  type RunResult,
  type RunSpec,
} from '../../../../shared/contracts/run/index.ts';
import { GitHub } from '../../services/github/index.ts';
import { Storage } from '../../services/storage/index.ts';
import { envFor } from '../credentials/index.ts';
import { RunLifecycle } from './lifecycle.ts';

/*
 * The RunnerApi's handlers: what a run's runner asks of the User Space over
 * its own socket. The Worker opened that socket for one run, named in the
 * socket's `RunnerCaller`, after checking the run's token; every call speaks
 * for that run alone, and none is taken once the run has ended.
 */

/** The run a runner's socket speaks for, said once at its upgrade. */
export const RunnerCaller = Context.Reference<{
  readonly runId: string;
} | null>('alchemy-console/UserSpace/RunnerCaller', {
  defaultValue: () => null,
});

const HEADER = 'x-console-runner';
const decode = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ runId: Schema.String })),
);

/** `request`, saying it is the runner of `runId`, whatever it said before. */
export const sentByRunner = (request: Request, runId: string): Request => {
  const headers = new Headers(request.headers);
  headers.set(HEADER, JSON.stringify({ runId }));
  return new Request(request, { headers });
};

/** The run the Worker said a request's runner performs; null when it said none. */
export const runnerOf = (headers: {
  readonly [name: string]: string | undefined;
}) => {
  const header = headers[HEADER];
  if (header === undefined) return null;
  const caller = decode(header);
  return caller._tag === 'Some' ? caller.value : null;
};

const caller = Effect.gen(function* () {
  const found = yield* RunnerCaller;
  if (found === null)
    return yield* new RunError({
      reason: 'not-found',
      message: 'This socket speaks for no run.',
    });
  return found.runId;
});

export const runnerHandlers = Effect.gen(function* () {
  const lifecycle = yield* RunLifecycle;
  const storage = yield* Storage;
  const github = yield* GitHub;
  const context =
    yield* Effect.context<Effect.Services<ReturnType<typeof envFor>>>();
  return {
    spec: () =>
      Effect.gen(function* () {
        const runId = yield* caller;
        yield* lifecycle.heard(runId);
        const run = yield* lifecycle.active(runId);
        const connection = yield* storage.connections.get(run.connectionId);
        if (connection === null)
          return yield* new RunError({
            reason: 'not-found',
            message: 'The GitHub connection this run reads from is gone.',
          });
        const githubToken = yield* github
          .checkoutToken({
            installationId: connection.installationId,
            repo: run.repo,
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new RunError({ reason: 'invalid', message: error.message }),
            ),
          );
        return {
          runId,
          kind: run.kind,
          repo: run.repo,
          commit: run.commit,
          folder: run.folder,
          setupCommand: run.setupCommand,
          stage: run.stage,
          entrypoint: run.entrypoint,
          githubToken,
        } satisfies RunSpec;
      }),
    credentials: () =>
      Effect.gen(function* () {
        const runId = yield* caller;
        yield* lifecycle.heard(runId);
        const run = yield* lifecycle.active(runId);
        const env: Record<string, string> = {};
        // An Inspect reads the stack and changes nothing: it gets no keys.
        if (run.kind === 'inspect') return env;
        for (const credentialId of Object.values(run.credentials))
          Object.assign(
            env,
            yield* envFor(credentialId).pipe(
              Effect.provideContext(context),
              Effect.mapError(
                (error) =>
                  new RunError({ reason: 'not-found', message: error.message }),
              ),
            ),
          );
        return env;
      }),
    report: ({
      seq,
      event,
    }: {
      readonly seq: number;
      readonly event: RunnerEvent;
    }) =>
      Effect.gen(function* () {
        const runId = yield* caller;
        yield* lifecycle.report(
          runId,
          seq,
          (at) =>
            storage.runs.events.insert({ key: '', runId, seq, at, event }),
          'event',
        );
      }),
    log: ({
      seq,
      lines,
    }: {
      readonly seq: number;
      readonly lines: ReadonlyArray<string>;
    }) =>
      Effect.gen(function* () {
        const runId = yield* caller;
        yield* lifecycle.report(
          runId,
          seq,
          (at) => storage.runs.logs.insert({ key: '', runId, seq, at, lines }),
          'log',
        );
      }),
    heartbeat: () => Effect.flatMap(caller, (runId) => lifecycle.heard(runId)),
    finish: ({ result }: { readonly result: RunResult }) =>
      Effect.gen(function* () {
        const runId = yield* caller;
        yield* lifecycle.finish(runId, result);
      }),
    cancel: () =>
      Stream.unwrap(Effect.map(caller, (runId) => lifecycle.cancelled(runId))),
  };
});
