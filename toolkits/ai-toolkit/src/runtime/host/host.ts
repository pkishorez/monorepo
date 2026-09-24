import { Context, Effect, Fiber, Layer, Semaphore } from 'effect';
import type { StdTableService } from 'std-toolkit/db';
import { HOST_ID, RUN_TIMEOUT_MS } from '../constants.js';
import { Claude } from '../harnesses/claude/index.js';
import { Codex } from '../harnesses/codex/index.js';
import {
  makeMailbox,
  type MailboxPending,
} from '../interaction-mailbox/index.js';
import {
  common,
  type ClaudeProtocol,
  type CodexProtocol,
  type CommonProtocol,
} from '../protocol/index.js';
import { makeTranscript } from '../transcript/index.js';
import * as records from './records.js';

const ACTIVE_THREAD_STATUSES = common.activeThreadStatuses;
const COMMON_PARTS = common.parts;
const { HarnessFailed, RequestNotFound, RunConflict, RunNotFound, ThreadBusy } =
  common.errors;
const customPart = common.customPart;
type AiError = CommonProtocol['AiError'];
type ClaudeAnswer = ClaudeProtocol['Answer'];
type CodexAnswer = CodexProtocol['Answer'];
type HarnessContext = CommonProtocol['HarnessContext'];
type HarnessId = CommonProtocol['HarnessId'];
type RunOutcome = CommonProtocol['RunOutcome'];
type StartInput = CommonProtocol['StartInput'];
type ThreadStatus = CommonProtocol['ThreadStatus'];

type Table = StdTableService<'ai-toolkit'>;
type AnswerOf<H extends HarnessId> = H extends 'claude'
  ? ClaudeAnswer
  : CodexAnswer;

interface LiveRunOf<H extends HarnessId> {
  readonly harness: H;
  readonly runId: string;
  readonly threadId: string;
  readonly inputHash: string;
  readonly controller: AbortController;
  readonly resolve: (
    requestId: string,
    answer: AnswerOf<H>,
  ) => Effect.Effect<boolean>;
  readonly cancelPending: Effect.Effect<void>;
}

type LiveRun = LiveRunOf<'claude'> | LiveRunOf<'codex'>;

export interface HarnessHostConfig {
  readonly hostId?: string;
  readonly codexCommand?: string;
  readonly runTimeoutMs?: number;
}

export interface HarnessRunners {
  readonly claude: typeof Claude.run;
  readonly codex: typeof Codex.run;
}

export interface HarnessHostShape {
  readonly start: (input: StartInput) => Effect.Effect<void, AiError>;
  readonly cancel: (
    runId: string,
    reason?: string,
  ) => Effect.Effect<void, AiError>;
  readonly resolveClaude: (
    runId: string,
    requestId: string,
    answer: ClaudeAnswer,
  ) => Effect.Effect<void, AiError>;
  readonly resolveCodex: (
    runId: string,
    requestId: string,
    answer: CodexAnswer,
  ) => Effect.Effect<void, AiError>;
}

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const waitingStatus = (
  pending: ReadonlyArray<MailboxPending>,
): ThreadStatus => {
  const first = pending[0];
  if (first === undefined) return 'running';
  return first.kind === 'question' ? 'waiting-question' : 'waiting-approval';
};

export class HarnessHost extends Context.Service<
  HarnessHost,
  HarnessHostShape
>()('ai-toolkit/HarnessHost') {
  static layer(
    config: HarnessHostConfig = {},
    runners: HarnessRunners = { claude: Claude.run, codex: Codex.run },
  ): Layer.Layer<HarnessHost, never, Table> {
    return Layer.effect(
      HarnessHost,
      Effect.gen(function* () {
        const table = yield* Effect.context<Table>();
        const hostId = config.hostId ?? HOST_ID;
        const runTimeoutMs = config.runTimeoutMs ?? RUN_TIMEOUT_MS;
        yield* records.sweepOrphans;

        const active = new Map<string, LiveRun>();
        const hostScope = yield* Effect.scope;
        yield* Effect.addFinalizer(() =>
          Effect.forEach(
            [...active.values()],
            (run) =>
              run.cancelPending.pipe(
                Effect.andThen(
                  Effect.sync(() =>
                    run.controller.abort('Server shutting down'),
                  ),
                ),
              ),
            { discard: true },
          ),
        );
        const starts = yield* Semaphore.make(1);

        const findRun = (runId: string): LiveRun | undefined =>
          [...active.values()].find((run) => run.runId === runId);

        // Runs the harness to its end, then records how the Run and its
        // Thread finished. Every write goes through the Transcript.
        const execute = (
          input: StartInput,
          run: (context: HarnessContext) => Promise<RunOutcome>,
          controller: AbortController,
          cwd: string,
          sessionId: string | undefined,
        ) =>
          Effect.gen(function* () {
            const transcript = yield* makeTranscript(input);
            const drain = yield* Effect.forkChild(transcript.drain);
            const context: HarnessContext = {
              cwd,
              ...(sessionId === undefined ? {} : { sessionId }),
              signal: controller.signal,
              transcript: transcript.writer,
              session: (id) =>
                Effect.runPromise(
                  records.saveSession(input, id).pipe(Effect.provide(table)),
                ),
            };
            const outcome = yield* Effect.tryPromise({
              try: () => run(context),
              catch: (cause): RunOutcome => ({
                type: 'failed',
                message: errorMessage(cause),
                facts: null,
              }),
            }).pipe(
              Effect.catch((failure) => Effect.succeed(failure)),
              Effect.timeoutOrElse({
                duration: runTimeoutMs,
                orElse: () =>
                  Effect.sync((): RunOutcome => {
                    controller.abort('Run timed out');
                    return {
                      type: 'failed',
                      message: 'Run timed out',
                      facts: null,
                    };
                  }),
              }),
            );
            if (outcome.type === 'failed' && !controller.signal.aborted) {
              transcript.writer.part(
                customPart(COMMON_PARTS.ERROR, { message: outcome.message }),
              );
            }
            yield* transcript.close;
            yield* Fiber.join(drain).pipe(
              Effect.catch((error) => Effect.logError(error)),
            );
            const status = controller.signal.aborted
              ? 'cancelled'
              : outcome.type === 'completed'
                ? 'completed'
                : 'failed';
            yield* records.finishRun(input, status, outcome.facts);
            yield* records.setThreadStatus(
              input.threadId,
              status === 'completed' ? 'idle' : status,
              null,
            );
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                if (active.get(input.threadId)?.runId === input.runId) {
                  active.delete(input.threadId);
                }
              }),
            ),
            Effect.provide(table),
          );

        const prepare = (
          input: StartInput,
          controller: AbortController,
          inputHash: string,
        ) => {
          const onPending = (pending: ReadonlyArray<MailboxPending>) =>
            records
              .setRunStatus(input, pending.length === 0 ? 'running' : 'waiting')
              .pipe(
                Effect.andThen(
                  records.setThreadStatus(
                    input.threadId,
                    waitingStatus(pending),
                    input.runId,
                  ),
                ),
                Effect.provide(table),
              );
          const base = {
            runId: input.runId,
            threadId: input.threadId,
            inputHash,
            controller,
          };
          return input.harness === 'claude'
            ? Effect.map(makeMailbox<ClaudeAnswer>(onPending), (mailbox) => ({
                live: {
                  ...base,
                  harness: 'claude',
                  resolve: mailbox.resolve,
                  cancelPending: mailbox.resolveAll,
                } satisfies LiveRunOf<'claude'>,
                run: (context: HarnessContext) =>
                  runners.claude(input, context, mailbox),
              }))
            : Effect.map(makeMailbox<CodexAnswer>(onPending), (mailbox) => ({
                live: {
                  ...base,
                  harness: 'codex',
                  resolve: mailbox.resolve,
                  cancelPending: mailbox.resolveAll,
                } satisfies LiveRunOf<'codex'>,
                run: (context: HarnessContext) =>
                  runners.codex(input, context, mailbox, config.codexCommand),
              }));
        };

        const resolve = <H extends HarnessId>(
          harness: H,
          runId: string,
          requestId: string,
          answer: AnswerOf<H>,
        ) =>
          Effect.gen(function* () {
            const run = findRun(runId);
            if (run === undefined || run.harness !== harness) {
              return yield* new RunNotFound({ runId });
            }
            const resolved = yield* (run as LiveRunOf<H>).resolve(
              requestId,
              answer,
            );
            if (!resolved) {
              return yield* new RequestNotFound({ runId, requestId });
            }
          });

        const start = (input: StartInput) =>
          Effect.gen(function* () {
            const inputHash = JSON.stringify(input);
            const current = active.get(input.threadId);
            if (current !== undefined) {
              if (current.runId !== input.runId) {
                return yield* new ThreadBusy({
                  threadId: input.threadId,
                  activeRunId: current.runId,
                });
              }
              if (current.inputHash !== inputHash) {
                return yield* new RunConflict({ runId: input.runId });
              }
              return;
            }

            const thread = yield* records.getThread(input.threadId);
            if (thread.harness !== input.harness) {
              return yield* new HarnessFailed({
                harness: input.harness,
                message: `Thread ${input.threadId} belongs to ${thread.harness}`,
              });
            }
            const existingHash = yield* records.getRunInputHash(input);
            if (existingHash !== null) {
              if (existingHash !== inputHash) {
                return yield* new RunConflict({ runId: input.runId });
              }
              return;
            }
            if (
              ACTIVE_THREAD_STATUSES.includes(thread.status) &&
              thread.activeRunId !== null
            ) {
              return yield* new ThreadBusy({
                threadId: input.threadId,
                activeRunId: thread.activeRunId,
              });
            }

            const controller = new AbortController();
            const prepared = yield* prepare(input, controller, inputHash);
            yield* records.insertRun(input, inputHash, hostId);
            yield* records
              .insertUserMessage(input)
              .pipe(
                Effect.tapError(() => records.setRunStatus(input, 'failed')),
              );
            yield* records.setThreadStatus(
              input.threadId,
              'running',
              input.runId,
            );
            active.set(input.threadId, prepared.live);
            yield* execute(
              input,
              prepared.run,
              controller,
              thread.cwd,
              records.harnessSession(thread),
            ).pipe(Effect.forkIn(hostScope));
          }).pipe(Effect.provide(table));

        return {
          start: (input) => starts.withPermits(1)(start(input)),
          cancel: (runId, reason) =>
            Effect.gen(function* () {
              const run = findRun(runId);
              if (run === undefined) {
                return yield* new RunNotFound({ runId });
              }
              yield* run.cancelPending;
              run.controller.abort(reason ?? 'Run cancelled');
            }),
          resolveClaude: (runId, requestId, answer) =>
            resolve('claude', runId, requestId, answer),
          resolveCodex: (runId, requestId, answer) =>
            resolve('codex', runId, requestId, answer),
        } satisfies HarnessHostShape;
      }),
    );
  }
}
