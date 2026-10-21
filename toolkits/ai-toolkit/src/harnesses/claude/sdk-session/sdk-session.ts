import { randomUUID } from 'node:crypto';
import { accessSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  query,
  type CanUseTool,
  type EffortLevel,
  type ModelInfo,
  type Options,
  type PermissionMode,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { Duration, Effect, Queue, Schema, Stream } from 'effect';
import type { Cause, Scope } from 'effect';
import {
  HarnessError,
  type AvailableModel,
  type HarnessSession,
  type RawOut,
} from '../../../harness/index.js';
import { makeStreamChunks } from './stream-chunks/index.js';
import { TurnEnd } from './turn-end/index.js';

export interface SdkSessionConfig {
  readonly cwd: string;
  readonly model: string;
  readonly nativeId?: string;
  readonly effort: EffortLevel;
  readonly permissionMode: PermissionMode;
}

/**
 * The Claude Code the user keeps updated: `AI_TOOLKIT_CLAUDE` or `claude` on
 * PATH. The SDK's bundled one lags behind, and refuses models newer than it.
 */
const installedClaude = (): string | undefined => {
  const candidates = [
    process.env['AI_TOOLKIT_CLAUDE'],
    ...(process.env['PATH'] ?? '')
      .split(delimiter)
      .filter((dir) => dir !== '')
      .map((dir) => join(dir, 'claude')),
  ];
  return candidates.find((path) => {
    if (path === undefined) return false;
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
};

/** How long a cancelled turn may take to report its result before its stream ends anyway. */
const CANCEL_GRACE_MS = 15_000;

/**
 * Records we do not keep: token deltas (kept as `text.chunk` records
 * instead, which a whole record's streamed blocks point at), the CLI's
 * queue bookkeeping, and thinking-token counters.
 * Everything else is a whole record.
 */
const skipped = (message: Record<string, unknown>): boolean =>
  message['type'] === 'stream_event' ||
  message['type'] === 'command_lifecycle' ||
  (message['type'] === 'system' && message['subtype'] === 'thinking_tokens');

const kindOf = (message: Record<string, unknown>): string =>
  message['type'] === 'system' && typeof message['subtype'] === 'string'
    ? `system/${message['subtype']}`
    : String(message['type']);

const toJson = (message: unknown): Schema.Json =>
  JSON.parse(JSON.stringify(message)) as Schema.Json;

const toRawOut = (message: Record<string, unknown>): RawOut => {
  const parent = message['parent_tool_use_id'];
  return {
    kind: kindOf(message),
    payload: toJson(message),
    ...(typeof parent === 'string' ? { agentId: parent } : {}),
  };
};

const canUseTool: CanUseTool = async (toolName, input) =>
  toolName === 'AskUserQuestion'
    ? { behavior: 'deny', message: 'Questions are not supported here.' }
    : { behavior: 'allow', updatedInput: input };

/** The user messages fed to the query, one at a time, as they are pushed. */
const userInput = () => {
  const waiting: SDKUserMessage[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const iterable = async function* (): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      const next = waiting.shift();
      if (next !== undefined) yield next;
      else await new Promise<void>((resolve) => (wake = resolve));
    }
  };
  const poke = () => {
    wake?.();
    wake = undefined;
  };
  return {
    iterable: iterable(),
    push: (message: SDKUserMessage) => {
      waiting.push(message);
      poke();
    },
    close: () => {
      closed = true;
      poke();
    },
  };
};

/** Claude Code's runtime takes `{ cancelQueued }`; its typings do not say so yet. */
type Interrupt = (options?: { cancelQueued?: boolean }) => Promise<unknown>;

interface Turn {
  readonly out: Queue.Queue<RawOut, HarnessError | Cause.Done>;
  state: TurnEnd.TurnEnd;
}

/**
 * One Agent SDK `query` in streaming-input mode, alive for the Scope.
 * Each turn pushes a user message and streams every whole record the query
 * emits until `TurnEnd` says every message we sent got its result.
 */
export const openSdkSession = (
  config: SdkSessionConfig,
): Effect.Effect<HarnessSession, HarnessError, Scope.Scope> =>
  Effect.gen(function* () {
    const input = userInput();
    const executable = installedClaude();
    const options: Options = {
      cwd: config.cwd,
      ...(executable === undefined
        ? {}
        : { pathToClaudeCodeExecutable: executable }),
      model: config.model,
      effort: config.effort,
      permissionMode: config.permissionMode,
      // Token deltas, batched into a few sentences per text.chunk record.
      includePartialMessages: true,
      ...(config.permissionMode === 'bypassPermissions'
        ? { allowDangerouslySkipPermissions: true }
        : {}),
      ...(config.nativeId === undefined ? {} : { resume: config.nativeId }),
      // A turn lasts until the agent is idle: subagents and shell commands
      // run in the foreground, so none outlives its turn.
      env: { ...process.env, CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' },
      disallowedTools: ['AskUserQuestion'],
      // Bypass approves every call without asking, so the SDK warns that a
      // canUseTool would never run; the other modes ask it.
      ...(config.permissionMode === 'bypassPermissions' ? {} : { canUseTool }),
    };
    const live = yield* Effect.try({
      try: () => query({ prompt: input.iterable, options }),
      catch: (cause) =>
        new HarnessError({ message: 'Claude Code did not start', cause }),
    });

    const scope = yield* Effect.scope;
    let nativeId = config.nativeId;
    let turn: Turn | undefined;
    let stopped: HarnessError | undefined;
    const chunks = makeStreamChunks();
    let timerSet = false;

    const send = (outs: ReadonlyArray<RawOut>) =>
      Effect.suspend(() =>
        turn === undefined || outs.length === 0
          ? Effect.void
          : Queue.offerAll(turn.out, outs),
      );

    // Text left waiting in a slow stream is sent once it is due, even when
    // no record arrives to send it with.
    const armTimer: Effect.Effect<void> = Effect.suspend(() => {
      const at = chunks.nextDue();
      if (timerSet || at === undefined) return Effect.void;
      timerSet = true;
      return Effect.sleep(Math.max(0, at - Date.now())).pipe(
        Effect.andThen(
          Effect.suspend(() => {
            timerSet = false;
            return send(chunks.due(Date.now()));
          }),
        ),
        Effect.andThen(armTimer),
        Effect.forkIn(scope),
        Effect.asVoid,
      );
    });

    const push = (text: string): string => {
      const uuid = randomUUID();
      input.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        // `next` folds the message into the running turn at its next tool
        // boundary; `now` would abort the turn's work in flight.
        priority: 'next',
        uuid: uuid as SDKUserMessage['uuid'] & string,
      });
      return uuid;
    };

    // Text still waiting is sent before the turn ends, so a cancelled
    // turn's chunks still add up to what was written.
    const finish = (current: Turn) =>
      Effect.suspend(() => {
        if (turn === current) turn = undefined;
        return Queue.offerAll(current.out, chunks.closeAll()).pipe(
          Effect.andThen(Queue.end(current.out)),
        );
      });

    const interrupt = Effect.promise(() =>
      (live.interrupt as Interrupt)({ cancelQueued: true }).catch(
        () => undefined,
      ),
    );

    const onMessage = (message: SDKMessage) =>
      Effect.gen(function* () {
        const record = message as unknown as Record<string, unknown>;
        if (
          record['type'] === 'system' &&
          record['subtype'] === 'init' &&
          typeof record['session_id'] === 'string'
        ) {
          nativeId = record['session_id'];
        }
        if (record['type'] === 'stream_event') {
          yield* send(chunks.event(record, Date.now()));
          yield* send(chunks.due(Date.now()));
          yield* armTimer;
          return;
        }
        const current = turn;
        // Records between turns (late task notifications) have no turn to join.
        if (current === undefined) return;
        if (
          record['type'] === 'command_lifecycle' &&
          record['state'] === 'cancelled' &&
          typeof record['command_uuid'] === 'string'
        ) {
          const [state, step] = TurnEnd.dropped(
            current.state,
            record['command_uuid'],
          );
          current.state = state;
          if (step === 'end') yield* finish(current);
          return;
        }
        if (skipped(record)) return;
        if (record['type'] === 'assistant') {
          const whole = chunks.whole(record);
          yield* send(whole.chunks);
          yield* Queue.offer(current.out, toRawOut(whole.record));
          return;
        }
        if (record['type'] === 'result') yield* send(chunks.closeAll());
        yield* Queue.offer(current.out, toRawOut(record));
        if (record['type'] !== 'result') return;
        const [state, step] = TurnEnd.result(current.state, record);
        current.state = state;
        if (step === 'end') yield* finish(current);
        if (step === 'interrupt') yield* interrupt;
      });

    const stop = (error: HarnessError) =>
      Effect.suspend(() => {
        stopped = error;
        const current = turn;
        turn = undefined;
        const rest = chunks.closeAll();
        return current === undefined
          ? Effect.void
          : Queue.offerAll(current.out, rest).pipe(
              Effect.andThen(Queue.fail(current.out, error)),
            );
      });

    yield* Stream.fromAsyncIterable(
      live,
      (cause) => new HarnessError({ message: 'Claude Code failed', cause }),
    ).pipe(
      Stream.runForEach(onMessage),
      Effect.flatMap(() =>
        stop(new HarnessError({ message: 'Claude Code exited' })),
      ),
      Effect.catch(stop),
      Effect.forkScoped,
    );
    // Added after the reader fork so it runs first: closing the query ends
    // the reader, where interrupting the reader first would wait on it.
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        input.close();
        live.close();
      }),
    );

    const session: HarnessSession = {
      nativeId: Effect.sync(() => nativeId),
      turn: (text) =>
        Stream.unwrap(
          Effect.gen(function* () {
            if (stopped !== undefined) return yield* Effect.fail(stopped);
            if (turn !== undefined) {
              return yield* Effect.fail(
                new HarnessError({ message: 'A turn is already running' }),
              );
            }
            const out = yield* Queue.unbounded<
              RawOut,
              HarnessError | Cause.Done
            >();
            const current: Turn = { out, state: TurnEnd.start(push(text)) };
            turn = current;
            return Stream.fromQueue(out).pipe(
              Stream.ensuring(
                Effect.sync(() => {
                  if (turn === current) turn = undefined;
                }),
              ),
            );
          }),
        ),
      steer: (text) =>
        Effect.suspend(() => {
          const current = turn;
          if (current === undefined) {
            return Effect.fail(
              new HarnessError({ message: 'No turn is running to steer' }),
            );
          }
          current.state = TurnEnd.sent(current.state, push(text));
          return Effect.void;
        }),
      cancel: Effect.suspend(() => {
        const current = turn;
        if (current === undefined) return Effect.void;
        current.state = TurnEnd.cancel(current.state);
        return interrupt.pipe(
          Effect.andThen(
            Effect.sleep(CANCEL_GRACE_MS).pipe(
              Effect.andThen(finish(current)),
              Effect.forkIn(scope),
            ),
          ),
          Effect.asVoid,
        );
      }),
    };
    return session;
  });

const ASK_TIMEOUT = Duration.seconds(15);

/**
 * Claude Code's model rows as models: each by the id it resolves to, the
 * `default` row only marking which one is the default.
 */
export const toAvailableModels = (
  rows: ReadonlyArray<ModelInfo>,
): ReadonlyArray<AvailableModel> => {
  const fallback = rows.find((row) => row.value === 'default')?.resolvedModel;
  const models = new Map<string, AvailableModel>();
  for (const row of rows) {
    const id = row.resolvedModel ?? row.value;
    if (row.value === 'default' || models.has(id)) continue;
    models.set(id, {
      id,
      name: row.displayName,
      ...(id === fallback ? { isDefault: true } : {}),
    });
  }
  return [...models.values()];
};

/**
 * The models this login can run, as Claude Code offers them: a query that
 * is never sent a message, asked, then closed. No API call is made.
 */
export const supportedModels: Effect.Effect<
  ReadonlyArray<AvailableModel>,
  HarnessError
> = Effect.acquireRelease(
  Effect.try({
    try: () => {
      const executable = installedClaude();
      const input = userInput();
      return {
        input,
        live: query({
          prompt: input.iterable,
          options: {
            cwd: tmpdir(),
            ...(executable === undefined
              ? {}
              : { pathToClaudeCodeExecutable: executable }),
          },
        }),
      };
    },
    catch: (cause) =>
      new HarnessError({ message: 'Claude Code did not start', cause }),
  }),
  ({ input, live }) =>
    Effect.sync(() => {
      input.close();
      live.close();
    }),
).pipe(
  Effect.flatMap(({ live }) =>
    Effect.tryPromise({
      try: () => live.supportedModels(),
      catch: (cause) =>
        new HarnessError({
          message: 'Claude Code did not list its models',
          cause,
        }),
    }),
  ),
  Effect.map(toAvailableModels),
  Effect.scoped,
  Effect.timeoutOrElse({
    duration: ASK_TIMEOUT,
    orElse: () =>
      Effect.fail(
        new HarnessError({
          message: 'Claude Code took too long to list its models',
        }),
      ),
  }),
);
