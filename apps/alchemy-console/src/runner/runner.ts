import { tmpdir } from 'node:os';
import path from 'node:path';
import { Effect, Layer, Schedule, Stream } from 'effect';
import { RpcClient } from 'effect/rpc';
import { Rpc } from '@kestack/rpc-toolkit/rpc';
import type {
  RunError,
  RunResult,
  RunSpec,
} from '../shared/contracts/run/index.ts';
import { RunnerApi } from '../shared/contracts/runner-api/index.ts';
import { deploy, InspectFailure, inspect } from './alchemy.ts';
import { makeOutbox, type Outbox } from './outbox.ts';
import { CommandFailed } from './processes.ts';
import { checkout, setup } from './workspace.ts';

/*
 * The runner: Console's program inside a run's container. It is given three
 * variables and nothing else: `RUN_ID`, `RUN_TOKEN` (good for this run
 * alone) and `CONSOLE_URL`. It opens one socket to `CONSOLE_URL/runner`
 * with the token, asks for the run's spec (with a GitHub token minted for
 * this run), checks the commit out, installs it, runs the project's own
 * Alchemy, reports each step as it goes, and says how the run ended. When
 * its owner cancels, the work stops where it is.
 *
 * Nothing the project runs sees the run's token: it is taken out of the
 * environment before any command starts.
 */

export interface RunnerOptions {
  readonly runId: string;
  readonly token: string;
  /** Console's own URL, `https://…`. */
  readonly consoleUrl: string;
  /** Where the checkout goes; a fresh folder of its own by default. */
  readonly workdir?: string;
}

/** The provider variables that hold a secret: `CLOUDFLARE_API_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`. */
const SECRET_NAME = /TOKEN|SECRET|PASSWORD/;

const isRunError = (error: unknown): error is RunError =>
  typeof error === 'object' &&
  error !== null &&
  (error as { _tag?: unknown })._tag === 'RunError';

/** A call to the User Space, tried again until it is answered, unless it is refused. */
const answered = <A>(call: Effect.Effect<A, unknown>) =>
  call.pipe(
    Effect.timeout('30 seconds'),
    Effect.retry({
      while: (error) => !isRunError(error),
      schedule: Schedule.spaced('2 seconds'),
      times: 90,
    }),
  );

const messageOf = (error: unknown) =>
  error instanceof InspectFailure || error instanceof CommandFailed
    ? error.message
    : isRunError(error)
      ? error.message
      : error instanceof Error
        ? `The runner failed: ${error.message}`
        : 'The runner failed.';

/** What the run does once its spec is in hand; `credentials` asks for the provider environment it deploys with. */
const perform = (
  spec: RunSpec,
  outbox: Outbox,
  workdir: string,
  credentials: Effect.Effect<Readonly<Record<string, string>>, unknown>,
) =>
  Effect.gen(function* () {
    // Whatever the project's commands run gets this environment: Console's
    // run variables are never in it.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CI: 'true',
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
    };
    yield* outbox.event({ _tag: 'Phase', phase: 'cloning' });
    const { root, folder } = yield* checkout({
      spec,
      dir: workdir,
      env,
      onLine: outbox.line,
    });
    yield* outbox.event({ _tag: 'Phase', phase: 'setup' });
    yield* setup({ spec, root, folder, env, onLine: outbox.line });
    yield* outbox.event({ _tag: 'Phase', phase: 'inspecting' });
    const result = yield* Effect.tryPromise({
      try: () =>
        inspect({ folder, entrypoint: spec.entrypoint, stage: spec.stage }),
      catch: (error) => error,
    });
    yield* outbox.event({ _tag: 'Inspected', result });
    if (spec.kind === 'inspect')
      return { _tag: 'Succeeded', inspect: result } satisfies RunResult;
    if (spec.kind !== 'deploy')
      return yield* Effect.fail(
        new InspectFailure(`This runner can’t ${spec.kind} yet.`),
      );
    if (result.stateStore !== 'cloudflare')
      return yield* Effect.fail(
        new InspectFailure(
          'Console deploys stacks that keep their state in Cloudflare: use `Cloudflare.state()`.',
        ),
      );
    // Only now, after the project's own commands ran, does the process
    // hold the provider keys: the stack's providers read them from here.
    const keys = yield* answered(credentials);
    // The secret ones: a region or an account ID is in many a URL.
    for (const [name, value] of Object.entries(keys))
      if (SECRET_NAME.test(name)) outbox.redact(value);
    Object.assign(process.env, keys);
    yield* outbox.event({ _tag: 'Phase', phase: 'planning' });
    const outputs = yield* Effect.tryPromise({
      try: () =>
        deploy({
          folder,
          entrypoint: spec.entrypoint,
          stage: spec.stage,
          onEvent: (event) => Effect.runSync(outbox.event(event)),
          onLine: outbox.line,
        }),
      catch: (error) => error,
    });
    return {
      _tag: 'Deployed',
      inspect: result,
      outputs,
    } satisfies RunResult;
  });

/** Performs the run, start to end. */
export const run = (options: RunnerOptions) =>
  Effect.gen(function* () {
    const client = yield* RpcClient.make(RunnerApi);
    const spec = yield* answered(client.spec());
    const outbox = yield* makeOutbox(
      {
        report: (seq, event) => client.report({ seq, event }),
        log: (seq, lines) => client.log({ seq, lines }),
      },
      {
        redact: [spec.githubToken, options.token],
        retryable: (error) => !isRunError(error),
      },
    );
    // Ends with `Cancelled` when the owner asks the run to stop.
    const cancelled = Rpc.websocket
      .keepSubscribed(() => client.cancel())
      .pipe(
        Stream.runHead,
        Effect.flatMap((asked) =>
          asked._tag === 'Some'
            ? Effect.succeed({ _tag: 'Cancelled' } satisfies RunResult)
            : Effect.never,
        ),
        Effect.catch(() => Effect.never),
      );
    // Heard from while a quiet command runs, so a healthy run is never Lost.
    yield* Effect.forkScoped(
      Effect.forever(
        Effect.sleep('1 minute').pipe(
          Effect.andThen(
            client
              .heartbeat()
              .pipe(Effect.timeout('30 seconds'), Effect.ignore),
          ),
        ),
      ),
    );
    const workdir =
      options.workdir ?? path.join(tmpdir(), `console-run-${options.runId}`);
    const result: RunResult = yield* Effect.raceFirst(
      perform(spec, outbox, workdir, client.credentials()).pipe(
        Effect.catch((error) =>
          Effect.succeed({
            _tag: 'Failed',
            message: messageOf(error),
          } satisfies RunResult),
        ),
      ),
      cancelled,
    );
    // An error or an output may quote a key: it leaves scrubbed.
    const told = outbox.scrub(result);
    if (told._tag === 'Failed') outbox.line(told.message);
    yield* outbox.flush;
    yield* answered(client.finish({ result: told })).pipe(
      Effect.catch((error) =>
        isRunError(error) ? Effect.void : Effect.fail(error),
      ),
    );
    return result;
  }).pipe(
    Effect.provide(
      Layer.empty.pipe(
        Layer.provideMerge(
          Rpc.websocket.client(RunnerApi, {
            url: `${options.consoleUrl.replace(/^http/, 'ws').replace(/\/$/, '')}/runner?token=${encodeURIComponent(options.token)}`,
          }),
        ),
      ),
    ),
    Effect.scoped,
  );

/** The container's entry: reads its three variables, and keeps the token out of every child's reach. */
export const main = async () => {
  const { RUN_ID, RUN_TOKEN, CONSOLE_URL } = process.env;
  delete process.env.RUN_TOKEN;
  delete process.env.RUN_ID;
  delete process.env.CONSOLE_URL;
  if (!RUN_ID || !RUN_TOKEN || !CONSOLE_URL) {
    console.error('The runner needs RUN_ID, RUN_TOKEN and CONSOLE_URL.');
    process.exit(2);
  }
  console.log(`Run ${RUN_ID}: reaching ${CONSOLE_URL}`);
  const result = await Effect.runPromise(
    run({ runId: RUN_ID, token: RUN_TOKEN, consoleUrl: CONSOLE_URL }),
  ).catch((error: unknown) => {
    console.error('The runner could not reach Console:', messageOf(error));
    return null;
  });
  console.log(`Run ${RUN_ID}: ${result?._tag ?? 'unreported'}`);
  process.exit(result === null ? 1 : 0);
};
