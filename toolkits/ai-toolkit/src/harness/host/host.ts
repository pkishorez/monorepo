import { EventType } from '@tanstack/ai';
import { Context, Effect, Layer, PubSub, Semaphore, Stream } from 'effect';
import type { StdTableService } from 'std-toolkit/db';
import { claudeRun, type ClaudeRunInput } from '../claude/index.js';
import { codexRun, type CodexRunInput } from '../codex/index.js';
import {
  HarnessFailed,
  HostMismatch,
  COMMON_EVENTS,
  RunConflict,
  RunNotFound,
  RunLogFailed,
  RequestNotFound,
  ThreadBusy,
  ThreadNotFound,
  type AgentChunk,
  type AiMessagePart,
  type AiError,
  type ClaudeAnswer,
  type CodexAnswer,
  type RunChunk,
  type ThreadState,
  makeMailbox,
  type Mailbox,
  type MailboxPending,
} from '../run-state/index.js';
import { messages, runs, threads } from '../table/index.js';

export type StartInput =
  | ({ readonly harness: 'claude' } & ClaudeRunInput)
  | ({ readonly harness: 'codex' } & CodexRunInput);

const terminal = (chunk: AgentChunk): boolean =>
  chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR';

export interface RunLogShape {
  readonly recover: (hostId: string) => Effect.Effect<void, RunLogFailed>;
  readonly sweep: (
    hostId: string,
    waitingBefore: number,
  ) => Effect.Effect<void, RunLogFailed>;
  readonly claim: (
    runId: string,
    threadId: string,
    hostId: string,
  ) => Effect.Effect<
    | { readonly claimed: true }
    | { readonly claimed: false; readonly hostId: string },
    RunLogFailed
  >;
  readonly append: (
    runId: string,
    chunk: AgentChunk,
  ) => Effect.Effect<RunChunk, RunLogFailed>;
  readonly finish: (runId: string) => Effect.Effect<void, RunLogFailed>;
  readonly watchRun: (
    runId: string,
    after?: number,
  ) => Stream.Stream<RunChunk, RunLogFailed>;
  readonly watchThread: (
    threadId: string,
    after?: { readonly runId: string; readonly sequence: number },
  ) => Stream.Stream<RunChunk, RunLogFailed>;
}

export class RunLog extends Context.Service<RunLog, RunLogShape>()(
  'ai-toolkit/RunLog',
) {
  static readonly memory = Layer.effect(
    RunLog,
    Effect.gen(function* () {
      const bus = yield* PubSub.unbounded<RunChunk>();
      const chunks = new Map<string, RunChunk[]>();
      const threadByRun = new Map<string, string>();
      const ownerByRun = new Map<string, string>();
      const runsByThread = new Map<string, string[]>();
      const activeByThread = new Map<string, string>();

      return {
        recover: () => Effect.void,
        sweep: () => Effect.void,
        claim: (runId, threadId, hostId) =>
          Effect.sync(() => {
            const activeRun = activeByThread.get(threadId);
            if (activeRun !== undefined && activeRun !== runId) {
              return {
                claimed: false,
                hostId: ownerByRun.get(activeRun) ?? 'unknown',
              } as const;
            }
            const owner = ownerByRun.get(runId);
            if (owner !== undefined && owner !== hostId) {
              return { claimed: false, hostId: owner } as const;
            }
            if (!chunks.has(runId)) {
              chunks.set(runId, []);
              threadByRun.set(runId, threadId);
              const order = runsByThread.get(threadId) ?? [];
              order.push(runId);
              runsByThread.set(threadId, order);
            }
            ownerByRun.set(runId, hostId);
            activeByThread.set(threadId, runId);
            return { claimed: true } as const;
          }),
        append: (runId, chunk) =>
          Effect.gen(function* () {
            const log = chunks.get(runId) ?? [];
            const item = { runId, sequence: log.length, chunk } as const;
            log.push(item);
            chunks.set(runId, log);
            yield* PubSub.publish(bus, item);
            return item;
          }),
        finish: (runId) =>
          Effect.sync(() => {
            const threadId = threadByRun.get(runId);
            if (
              threadId !== undefined &&
              activeByThread.get(threadId) === runId
            ) {
              activeByThread.delete(threadId);
            }
          }),
        watchRun: (runId, after = -1) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const subscription = yield* PubSub.subscribe(bus);
              const full = chunks.get(runId) ?? [];
              const replay = full.filter((item) => item.sequence > after);
              const storedTerminal = full.some((item) => terminal(item.chunk));
              if (storedTerminal) return Stream.fromIterable(replay);
              const cutoff = full.length - 1;
              return Stream.fromIterable(replay).pipe(
                Stream.concat(
                  Stream.fromSubscription(subscription).pipe(
                    Stream.filter(
                      (item) => item.runId === runId && item.sequence > cutoff,
                    ),
                    Stream.takeUntil((item) => terminal(item.chunk)),
                  ),
                ),
              );
            }),
          ),
        watchThread: (threadId, after) =>
          Stream.unwrap(
            Effect.gen(function* () {
              const subscription = yield* PubSub.subscribe(bus);
              const order = runsByThread.get(threadId) ?? [];
              const cutoff = new Map(
                order.map((runId) => [
                  runId,
                  (chunks.get(runId)?.length ?? 0) - 1,
                ]),
              );
              const replay: RunChunk[] = [];
              if (after === undefined) {
                const active = activeByThread.get(threadId);
                if (active !== undefined) {
                  replay.push(...(chunks.get(active) ?? []));
                }
              } else {
                const cursorIndex = order.indexOf(after.runId);
                if (cursorIndex >= 0) {
                  replay.push(
                    ...(chunks.get(after.runId) ?? []).filter(
                      (item) => item.sequence > after.sequence,
                    ),
                  );
                  for (const runId of order.slice(cursorIndex + 1)) {
                    replay.push(...(chunks.get(runId) ?? []));
                  }
                }
              }
              return Stream.fromIterable(replay).pipe(
                Stream.concat(
                  Stream.fromSubscription(subscription).pipe(
                    Stream.filter(
                      (item) =>
                        threadByRun.get(item.runId) === threadId &&
                        item.sequence > (cutoff.get(item.runId) ?? -1),
                    ),
                  ),
                ),
              );
            }),
          ),
      } satisfies RunLogShape;
    }),
  );
}

interface LiveRun {
  readonly runId: string;
  readonly threadId: string;
  readonly harness: 'claude' | 'codex';
  readonly fingerprint: string;
  readonly controller: AbortController;
  readonly resolve: (
    requestId: string,
    answer: unknown,
  ) => Effect.Effect<boolean>;
  readonly pending: Effect.Effect<ReadonlyArray<MailboxPending>>;
  readonly cancelPending: Effect.Effect<void>;
}

export interface AgentHostConfig {
  readonly hostId: string;
  readonly codexCommand?: string;
  readonly runTimeoutMs?: number;
  readonly waitingTtlMs?: number;
  readonly sweepIntervalMs?: number;
}

export interface AgentHostShape {
  readonly start: (
    input: StartInput,
  ) => Effect.Effect<void, AiError, StdTableService<'ai-toolkit'>>;
  readonly cancel: (
    runId: string,
    reason?: string,
  ) => Effect.Effect<void, AiError>;
  readonly resolve: (
    harness: 'claude' | 'codex',
    runId: string,
    requestId: string,
    answer: unknown,
  ) => Effect.Effect<void, AiError>;
  readonly getThread: (
    threadId: string,
  ) => Effect.Effect<ThreadState, AiError, StdTableService<'ai-toolkit'>>;
}

export class AgentHost extends Context.Service<AgentHost, AgentHostShape>()(
  'ai-toolkit/AgentHost',
) {
  static layer(config: AgentHostConfig) {
    return Layer.effect(
      AgentHost,
      Effect.gen(function* () {
        const log = yield* RunLog;
        yield* log.recover(config.hostId);
        const waitingTtlMs = config.waitingTtlMs ?? 900_000;
        const sweepIntervalMs = config.sweepIntervalMs ?? 60_000;
        yield* Effect.forever(
          Effect.sleep(sweepIntervalMs).pipe(
            Effect.andThen(
              Effect.sync(() => Date.now()).pipe(
                Effect.flatMap((now) =>
                  log.sweep(config.hostId, now - waitingTtlMs),
                ),
              ),
            ),
            Effect.catch((error) => Effect.logError(error)),
          ),
        ).pipe(Effect.forkScoped);
        const active = new Map<string, LiveRun>();
        const starts = yield* Semaphore.make(1);

        const findRun = (runId: string): LiveRun | undefined =>
          [...active.values()].find((run) => run.runId === runId);

        const persistStatus = (
          input: StartInput,
          status: 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled',
        ) =>
          runs
            .getAndUpdate(
              { threadId: input.threadId, id: input.runId },
              {
                status,
                ...(status === 'completed' ||
                status === 'failed' ||
                status === 'cancelled'
                  ? { finishedAt: Date.now() }
                  : {}),
              },
              { lastWriteWins: true },
            )
            .pipe(
              Effect.asVoid,
              Effect.catch(() => Effect.void),
            );

        const runProducer = (
          input: StartInput,
          mailbox: Mailbox<ClaudeAnswer | CodexAnswer>,
          controller: AbortController,
          cwd: string,
          sessionId: string | undefined,
          persist: (
            status: 'completed' | 'failed' | 'cancelled',
          ) => Effect.Effect<void>,
          persistPart: (
            id: string,
            part: AiMessagePart,
          ) => Effect.Effect<void, unknown>,
          persistSession: (sessionId: string) => Effect.Effect<void, unknown>,
        ) => {
          const emit = (chunk: AgentChunk) =>
            log.append(input.runId, chunk).pipe(Effect.asVoid);
          const context = {
            cwd,
            ...(sessionId === undefined ? {} : { sessionId }),
            signal: controller.signal,
            emit,
          };
          const iterable =
            input.harness === 'claude'
              ? claudeRun(
                  input,
                  context,
                  mailbox as unknown as Mailbox<ClaudeAnswer>,
                )
              : codexRun(
                  input,
                  context,
                  mailbox as unknown as Mailbox<CodexAnswer>,
                  config.codexCommand,
                );
          const text = new Map<string, string>();
          const toolCalls = new Map<
            string,
            {
              readonly name: string;
              readonly parentMessageId?: string;
              args: string;
            }
          >();
          let customPartIndex = 0;
          return Effect.tryPromise({
            try: async () => {
              let sawTerminal = false;
              let harnessFailed = false;
              for await (const chunk of iterable) {
                await Effect.runPromise(emit(chunk));
                if (chunk.type === EventType.TEXT_MESSAGE_START) {
                  text.set(chunk.messageId, '');
                } else if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
                  text.set(
                    chunk.messageId,
                    `${text.get(chunk.messageId) ?? ''}${chunk.delta}`,
                  );
                } else if (chunk.type === EventType.TEXT_MESSAGE_END) {
                  const content = text.get(chunk.messageId);
                  if (content !== undefined) {
                    await Effect.runPromise(
                      persistPart(chunk.messageId, { type: 'text', content }),
                    );
                    text.delete(chunk.messageId);
                  }
                } else if (chunk.type === EventType.TOOL_CALL_START) {
                  toolCalls.set(chunk.toolCallId, {
                    name: chunk.toolCallName,
                    ...(chunk.parentMessageId === undefined
                      ? {}
                      : { parentMessageId: chunk.parentMessageId }),
                    args: '',
                  });
                } else if (chunk.type === EventType.TOOL_CALL_ARGS) {
                  const call = toolCalls.get(chunk.toolCallId);
                  if (call !== undefined) call.args += chunk.delta;
                } else if (chunk.type === EventType.TOOL_CALL_END) {
                  const call = toolCalls.get(chunk.toolCallId);
                  if (call !== undefined) {
                    await Effect.runPromise(
                      persistPart(
                        `${call.parentMessageId ?? chunk.toolCallId}:${chunk.toolCallId}`,
                        {
                          type: 'tool-call',
                          id: chunk.toolCallId,
                          name: call.name,
                          arguments: call.args,
                          state: 'input-complete',
                        },
                      ),
                    );
                    toolCalls.delete(chunk.toolCallId);
                  }
                } else if (chunk.type === EventType.TOOL_CALL_RESULT) {
                  await Effect.runPromise(
                    persistPart(chunk.messageId, {
                      type: 'tool-result',
                      toolCallId: chunk.toolCallId,
                      content: chunk.content,
                      state: 'complete',
                    }),
                  );
                } else if (
                  chunk.type === EventType.CUSTOM &&
                  chunk.name === COMMON_EVENTS.SESSION_ID
                ) {
                  await Effect.runPromise(
                    persistSession(chunk.value.sessionId),
                  );
                } else if (
                  chunk.type === EventType.CUSTOM &&
                  chunk.messageId !== undefined
                ) {
                  await Effect.runPromise(
                    persistPart(
                      `${chunk.messageId}:custom:${customPartIndex++}`,
                      {
                        type: 'custom',
                        name: chunk.name,
                        data: chunk.value,
                      },
                    ),
                  );
                }
                sawTerminal ||= terminal(chunk);
                harnessFailed ||= chunk.type === EventType.RUN_ERROR;
              }
              if (controller.signal.aborted) {
                throw new Error(
                  typeof controller.signal.reason === 'string'
                    ? controller.signal.reason
                    : 'Run cancelled',
                );
              }
              if (!sawTerminal) {
                await Effect.runPromise(
                  emit({
                    type: EventType.RUN_FINISHED,
                    runId: input.runId,
                    threadId: input.threadId,
                    outcome: { type: 'success' },
                    timestamp: Date.now(),
                  }),
                );
              }
              return harnessFailed
                ? ('failed' as const)
                : ('completed' as const);
            },
            catch: (cause) =>
              new HarnessFailed({
                harness: input.harness,
                message: cause instanceof Error ? cause.message : String(cause),
              }),
          }).pipe(
            Effect.timeout(config.runTimeoutMs ?? 3_600_000),
            Effect.matchEffect({
              onSuccess: (status) => persist(status),
              onFailure: (error) =>
                Effect.sync(() => {
                  if (!controller.signal.aborted)
                    controller.abort('Run timed out');
                }).pipe(
                  Effect.andThen(
                    emit({
                      type: EventType.RUN_ERROR,
                      runId: input.runId,
                      threadId: input.threadId,
                      message:
                        error instanceof Error
                          ? error.message
                          : 'Run timed out',
                      timestamp: Date.now(),
                    }),
                  ),
                  Effect.andThen(
                    persist(
                      controller.signal.reason === 'Run timed out'
                        ? 'failed'
                        : 'cancelled',
                    ),
                  ),
                ),
            }),
            Effect.ensuring(
              Effect.sync(() => {
                if (active.get(input.threadId)?.runId === input.runId) {
                  active.delete(input.threadId);
                }
              }).pipe(
                Effect.andThen(log.finish(input.runId)),
                Effect.catch(() => Effect.void),
              ),
            ),
          );
        };

        return {
          start: (input) =>
            starts.withPermits(1)(
              Effect.gen(function* () {
                const tableContext =
                  yield* Effect.context<StdTableService<'ai-toolkit'>>();
                const provideTable = <A, E>(
                  effect: Effect.Effect<A, E, StdTableService<'ai-toolkit'>>,
                ) => Effect.provide(effect, tableContext);
                const fingerprint = JSON.stringify(input);
                const current = active.get(input.threadId);
                if (current !== undefined) {
                  if (current.runId !== input.runId) {
                    return yield* new ThreadBusy({
                      threadId: input.threadId,
                      activeRunId: current.runId,
                    });
                  }
                  if (current.fingerprint !== fingerprint) {
                    return yield* new RunConflict({ runId: input.runId });
                  }
                  return;
                }

                const threadRecord = yield* provideTable(
                  threads.get({ id: input.threadId }),
                ).pipe(
                  Effect.mapError(
                    () => new ThreadNotFound({ threadId: input.threadId }),
                  ),
                );
                if (threadRecord === null) {
                  return yield* new ThreadNotFound({
                    threadId: input.threadId,
                  });
                }
                const thread = threadRecord.value;
                if (
                  thread.harness !== input.harness ||
                  thread.data.type !== input.harness
                ) {
                  return yield* new HarnessFailed({
                    harness: input.harness,
                    message: `Thread ${input.threadId} belongs to ${thread.harness}`,
                  });
                }

                const existingRecord = yield* provideTable(
                  runs.get({
                    threadId: input.threadId,
                    id: input.runId,
                  }),
                ).pipe(
                  Effect.mapError(
                    (error) =>
                      new HarnessFailed({
                        harness: input.harness,
                        message: error.message,
                      }),
                  ),
                );
                if (existingRecord !== null) {
                  const existing = existingRecord.value;
                  if (existing.data.inputHash !== fingerprint) {
                    return yield* new RunConflict({ runId: input.runId });
                  }
                  return;
                }

                const ownership = yield* log.claim(
                  input.runId,
                  input.threadId,
                  config.hostId,
                );
                if (!ownership.claimed) {
                  return yield* new HostMismatch({
                    runId: input.runId,
                    expectedHost: ownership.hostId,
                  });
                }

                const controller = new AbortController();
                const updatePending = (pending: boolean) =>
                  persistStatus(input, pending ? 'waiting' : 'running').pipe(
                    Effect.provide(tableContext),
                  );
                const mailbox = yield* makeMailbox<ClaudeAnswer | CodexAnswer>(
                  updatePending,
                );
                const live: LiveRun = {
                  runId: input.runId,
                  threadId: input.threadId,
                  harness: input.harness,
                  fingerprint,
                  controller,
                  resolve: (requestId, answer) =>
                    mailbox.resolve(
                      requestId,
                      answer as ClaudeAnswer | CodexAnswer,
                    ),
                  pending: mailbox.pending,
                  cancelPending: mailbox.resolveAll,
                };
                yield* provideTable(
                  runs.insert({
                    id: input.runId,
                    threadId: input.threadId,
                    harness: input.harness,
                    status: 'running',
                    startedAt: Date.now(),
                    finishedAt: null,
                    data:
                      input.harness === 'claude'
                        ? {
                            type: 'claude',
                            model: input.model,
                            thinking:
                              input.options.thinking === undefined
                                ? null
                                : input.options.thinking,
                            permissionMode:
                              input.options.permissionMode ?? 'default',
                            allowDangerouslySkipPermissions:
                              input.options.allowDangerouslySkipPermissions ??
                              false,
                            maxTurns: input.options.maxTurns ?? null,
                            permissionTimeoutMs:
                              input.options.permissionTimeoutMs ?? null,
                            inputHash: fingerprint,
                          }
                        : {
                            type: 'codex',
                            model: input.model,
                            reasoningEffort:
                              input.options.reasoningEffort ?? null,
                            approvalPolicy:
                              input.options.approvalPolicy ?? 'on-request',
                            sandbox: input.options.sandbox ?? 'workspace-write',
                            requestTimeoutMs:
                              input.options.requestTimeoutMs ?? null,
                            inputHash: fingerprint,
                          },
                  }),
                ).pipe(
                  Effect.mapError(
                    (error) =>
                      new HarnessFailed({
                        harness: input.harness,
                        message: error.message,
                      }),
                  ),
                  Effect.tapError(() => log.finish(input.runId)),
                );
                yield* provideTable(
                  messages.insert({
                    id: input.message.id,
                    threadId: input.threadId,
                    runId: input.runId,
                    role: 'user',
                    createdAt: Date.now(),
                    data: {
                      parts: [{ type: 'text', content: input.message.content }],
                      metadata: null,
                    },
                  }),
                ).pipe(
                  Effect.mapError(
                    (error) =>
                      new HarnessFailed({
                        harness: input.harness,
                        message: error.message,
                      }),
                  ),
                  Effect.tapError(() =>
                    persistStatus(input, 'failed').pipe(
                      Effect.provide(tableContext),
                      Effect.andThen(log.finish(input.runId)),
                    ),
                  ),
                );
                active.set(input.threadId, live);
                const sessionId =
                  thread.data.type === 'claude'
                    ? (thread.data.sessionId ?? undefined)
                    : (thread.data.threadId ?? undefined);
                yield* runProducer(
                  input,
                  mailbox,
                  controller,
                  thread.cwd,
                  sessionId,
                  (status) =>
                    persistStatus(input, status).pipe(
                      Effect.provide(tableContext),
                    ),
                  (id, part) =>
                    messages
                      .insert({
                        id,
                        threadId: input.threadId,
                        runId: input.runId,
                        role: 'assistant',
                        createdAt: Date.now(),
                        data: {
                          parts: [part],
                          metadata: null,
                        },
                      })
                      .pipe(Effect.asVoid, Effect.provide(tableContext)),
                  (sessionId) =>
                    threads
                      .getAndUpdate(
                        { id: input.threadId },
                        {
                          data:
                            input.harness === 'claude'
                              ? { type: 'claude', sessionId }
                              : { type: 'codex', threadId: sessionId },
                        },
                        { lastWriteWins: true },
                      )
                      .pipe(Effect.asVoid, Effect.provide(tableContext)),
                ).pipe(Effect.forkDetach);
              }),
            ),
          cancel: (runId, reason) =>
            Effect.gen(function* () {
              const run = findRun(runId);
              if (run === undefined) {
                return yield* new RunNotFound({ runId });
              }
              yield* run.cancelPending;
              run.controller.abort(reason);
            }),
          resolve: (harness, runId, requestId, answer) =>
            Effect.gen(function* () {
              const run = findRun(runId);
              if (run === undefined || run.harness !== harness) {
                return yield* new RunNotFound({ runId });
              }
              const resolved = yield* run.resolve(requestId, answer);
              if (!resolved) {
                return yield* new RequestNotFound({ runId, requestId });
              }
            }),
          getThread: (threadId) =>
            Effect.gen(function* () {
              const threadRecord = yield* threads
                .get({ id: threadId })
                .pipe(Effect.mapError(() => new ThreadNotFound({ threadId })));
              if (threadRecord === null) {
                return yield* new ThreadNotFound({ threadId });
              }
              const thread = threadRecord.value;
              const run = active.get(threadId);
              if (run === undefined) return { threadId, status: 'idle' };
              const pending = yield* run.pending;
              const sessionId =
                thread.data.type === 'claude'
                  ? (thread.data.sessionId ?? undefined)
                  : (thread.data.threadId ?? undefined);
              return {
                threadId,
                status: pending.length === 0 ? 'running' : 'waiting',
                activeRunId: run.runId,
                ...(sessionId === undefined ? {} : { sessionId }),
                ...(pending.length === 0
                  ? {}
                  : {
                      pending,
                    }),
              };
            }),
        } satisfies AgentHostShape;
      }),
    );
  }
}
