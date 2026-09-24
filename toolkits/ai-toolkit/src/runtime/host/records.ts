import { Effect } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
import type { StdTableService } from 'std-toolkit/db';
import { SYNC_PAGE_SIZE } from '../constants.js';
import { common, type CommonProtocol } from '../protocol/index.js';
import {
  messages,
  runs,
  threads,
  type Run,
  type Thread,
} from '../table/index.js';

const ACTIVE_RUN_STATUSES = common.activeRunStatuses;
const ACTIVE_THREAD_STATUSES = common.activeThreadStatuses;
const { HarnessFailed, ThreadNotFound } = common.errors;
type RunStatus = CommonProtocol['RunStatus'];
type RunFacts = CommonProtocol['RunFacts'];
type StartInput = CommonProtocol['StartInput'];
type ThreadStatus = CommonProtocol['ThreadStatus'];
type HarnessFailed = CommonProtocol['HarnessFailed'];
type ThreadNotFound = CommonProtocol['ThreadNotFound'];

type Table = StdTableService<'ai-toolkit'>;

const failed = (input: StartInput) => (error: { readonly message: string }) =>
  new HarnessFailed({ harness: input.harness, message: error.message });

export const harnessSession = (thread: Thread): string | undefined =>
  (thread.data.type === 'claude'
    ? thread.data.sessionId
    : thread.data.threadId) ?? undefined;

export const getThread = (
  threadId: string,
): Effect.Effect<Thread, ThreadNotFound, Table> =>
  threads.get({ id: threadId }).pipe(
    Effect.mapError(() => new ThreadNotFound({ threadId })),
    Effect.flatMap((record) =>
      record === null
        ? Effect.fail(new ThreadNotFound({ threadId }))
        : Effect.succeed(record.value),
    ),
  );

export const getRunInputHash = (
  input: StartInput,
): Effect.Effect<string | null, HarnessFailed, Table> =>
  runs.get({ threadId: input.threadId, id: input.runId }).pipe(
    Effect.mapError(failed(input)),
    Effect.map((record) => record?.value.data.inputHash ?? null),
  );

export const insertRun = (
  input: StartInput,
  inputHash: string,
  hostId: string,
): Effect.Effect<void, HarnessFailed, Table> =>
  runs
    .insert({
      id: input.runId,
      threadId: input.threadId,
      harness: input.harness,
      status: 'running',
      hostId,
      startedAt: Date.now(),
      finishedAt: null,
      data:
        input.harness === 'claude'
          ? {
              type: 'claude',
              model: input.model,
              thinking: input.options.thinking ?? null,
              permissionMode: input.options.permissionMode ?? 'default',
              allowDangerouslySkipPermissions:
                input.options.allowDangerouslySkipPermissions ?? false,
              maxTurns: input.options.maxTurns ?? null,
              permissionTimeoutMs: input.options.permissionTimeoutMs ?? null,
              inputHash,
              facts: null,
            }
          : {
              type: 'codex',
              model: input.model,
              reasoningEffort: input.options.reasoningEffort ?? null,
              approvalPolicy: input.options.approvalPolicy ?? 'on-request',
              sandbox: input.options.sandbox ?? 'workspace-write',
              requestTimeoutMs: input.options.requestTimeoutMs ?? null,
              inputHash,
              facts: null,
            },
    })
    .pipe(Effect.asVoid, Effect.mapError(failed(input)));

export const insertUserMessage = (
  input: StartInput,
): Effect.Effect<void, HarnessFailed, Table> =>
  messages
    .insert({
      id: input.message.id,
      threadId: input.threadId,
      runId: input.runId,
      role: 'user',
      createdAt: Date.now(),
      data: {
        parts: [{ type: 'text', content: input.message.content }],
        metadata: null,
      },
    })
    .pipe(Effect.asVoid, Effect.mapError(failed(input)));

export const setRunStatus = (
  key: { readonly threadId: string; readonly runId: string },
  status: RunStatus,
): Effect.Effect<void, never, Table> =>
  runs
    .getAndUpdate(
      { threadId: key.threadId, id: key.runId },
      {
        status,
        ...(ACTIVE_RUN_STATUSES.includes(status)
          ? {}
          : { finishedAt: Date.now() }),
      },
      { lastWriteWins: true },
    )
    .pipe(Effect.asVoid, Effect.ignore);

export const finishRun = (
  input: StartInput,
  status: Exclude<RunStatus, 'running' | 'waiting'>,
  facts: RunFacts | null,
): Effect.Effect<void, never, Table> =>
  runs
    .getAndUpdate(
      { threadId: input.threadId, id: input.runId },
      (run) => ({
        status,
        finishedAt: Date.now(),
        data:
          run.data.type === 'claude'
            ? {
                ...run.data,
                facts: facts?.type === 'claude' ? facts : run.data.facts,
              }
            : {
                ...run.data,
                facts: facts?.type === 'codex' ? facts : run.data.facts,
              },
      }),
      { lastWriteWins: true },
    )
    .pipe(Effect.asVoid, Effect.ignore);

export const setThreadStatus = (
  threadId: string,
  status: ThreadStatus,
  activeRunId: string | null,
): Effect.Effect<void, never, Table> =>
  threads
    .getAndUpdate(
      { id: threadId },
      { status, activeRunId },
      {
        lastWriteWins: true,
      },
    )
    .pipe(Effect.asVoid, Effect.ignore);

export const saveSession = (
  input: StartInput,
  sessionId: string,
): Effect.Effect<void, never, Table> =>
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
    .pipe(Effect.asVoid, Effect.ignore);

const everyPage = <T extends object>(
  fetchPage: (
    after: DecodedEntity<T> | undefined,
  ) => Effect.Effect<
    { readonly items: readonly DecodedEntity<T>[]; readonly hasMore: boolean },
    unknown,
    Table
  >,
): Effect.Effect<ReadonlyArray<DecodedEntity<T>>, never, Table> =>
  Effect.gen(function* () {
    const collected: DecodedEntity<T>[] = [];
    let after: DecodedEntity<T> | undefined;
    while (true) {
      const page = yield* fetchPage(after).pipe(Effect.orDie);
      collected.push(...page.items);
      const last = page.items.at(-1);
      if (!page.hasMore || last === undefined) return collected;
      after = last;
    }
  });

/**
 * The Bootstrap Sweep: every Run still running or waiting when the host
 * starts was orphaned by a previous process, so it and its Thread end as
 * cancelled.
 */
export const sweepOrphans: Effect.Effect<void, never, Table> = Effect.gen(
  function* () {
    const allRuns = yield* everyPage<Run>((after) =>
      runs.query(
        'byUpdate',
        { pk: {}, '>=': null },
        { limit: SYNC_PAGE_SIZE, ...(after === undefined ? {} : { after }) },
      ),
    );
    yield* Effect.forEach(
      allRuns.filter((run) => ACTIVE_RUN_STATUSES.includes(run.value.status)),
      (run) =>
        setRunStatus(
          { threadId: run.value.threadId, runId: run.value.id },
          'cancelled',
        ),
      { discard: true },
    );
    const allThreads = yield* everyPage<Thread>((after) =>
      threads.query(
        'byUpdate',
        { pk: {}, '>=': null },
        { limit: SYNC_PAGE_SIZE, ...(after === undefined ? {} : { after }) },
      ),
    );
    yield* Effect.forEach(
      allThreads.filter((thread) =>
        ACTIVE_THREAD_STATUSES.includes(thread.value.status),
      ),
      (thread) => setThreadStatus(thread.value.id, 'cancelled', null),
      { discard: true },
    );
  },
);
