import type {
  CanUseTool,
  Options,
  PermissionMode,
  PermissionResult,
  SDKMessage,
  SDKRateLimitInfo,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { Deferred, Duration, Effect, Exit, Scope, Stream } from 'effect';
import {
  ClaudeError,
  type ClaudeRequest,
  type Live,
  type Mode,
  type Prompt,
  type Status,
} from '../contract/index.js';
import { ClaudeDriver, type Control } from './driver.js';
import { makeFeed, type Feed } from './feed.js';
import { Out } from './out.js';

const CANCEL_GRACE = Duration.seconds(10);

type Uuid = ReturnType<typeof crypto.randomUUID>;

interface Run {
  readonly uuid: Uuid;
  readonly prompt: Prompt;
  readonly log: Feed<Out, ClaudeError>;
  readonly pending: Set<string>;
  readonly steers: Set<string>;
  at: string | undefined;
  result: SDKResultMessage | undefined;
  cancelling: boolean;
}

interface Asked {
  readonly request: ClaudeRequest;
  readonly answer: (result: PermissionResult) => void;
}

interface Ending {
  readonly status: Status;
  readonly error?: string;
}

export interface Instance {
  readonly start: (
    prompt: Prompt,
    mode: Mode,
  ) => Stream.Stream<Out, ClaudeError>;
  readonly respond: (
    requestId: string,
    answer: PermissionResult,
  ) => Effect.Effect<void, ClaudeError>;
  readonly cancel: Effect.Effect<void>;
  readonly watch: Stream.Stream<Live>;
  readonly live: () => Live;
  readonly control: Control;
  readonly gone: Effect.Effect<void>;
}

export interface InstanceConfig {
  readonly id: string;
  readonly cwd: string;
  readonly options: Options;
}

const answeredBy = (
  result: SDKResultMessage,
  pending: ReadonlySet<string>,
): ReadonlyArray<string> => {
  if (result.user_message_uuids !== undefined) return result.user_message_uuids;
  if (result.user_message_uuid !== undefined) return [result.user_message_uuid];
  return [...pending].slice(0, 1);
};

const endingOf = (run: Run): Ending => {
  const result = run.result;
  if (run.cancelling) return { status: 'cancelled' };
  if (result === undefined)
    return { status: 'failed', error: 'Claude Code gave no result' };
  if (result.subtype === 'success' && !result.is_error)
    return { status: 'completed' };
  return {
    status: 'failed',
    error:
      result.subtype === 'success' ? result.result : result.errors.join('\n'),
  };
};

const cancelledCommand = (message: object): string | undefined =>
  'command_uuid' in message &&
  'state' in message &&
  message.state === 'cancelled' &&
  typeof message.command_uuid === 'string'
    ? message.command_uuid
    : undefined;

const forkPointOf = (message: SDKMessage): string | undefined =>
  (message.type === 'assistant' || message.type === 'user') &&
  message.parent_tool_use_id === null
    ? message.uuid
    : undefined;

export const makeInstance = (
  config: InstanceConfig,
): Effect.Effect<Instance, ClaudeError, ClaudeDriver | Scope.Scope> =>
  Effect.gen(function* () {
    const driver = yield* ClaudeDriver;
    const scope = yield* Effect.scope;
    const watchers = makeFeed<Live>('last');
    const goneSignal = Deferred.makeUnsafe<void>();
    const requests = new Map<string, Asked>();
    const queue: Array<Run> = [];
    let current: Run | undefined;
    const stale = new Set<string>();
    let started = false;
    let isGone = false;
    let model: string | undefined;
    let permissionMode: PermissionMode | undefined;
    let rateLimit: SDKRateLimitInfo | undefined;

    const live = (): Live => ({
      id: config.id,
      cwd: config.cwd,
      status: !started
        ? 'starting'
        : current === undefined
          ? 'ready'
          : 'running',
      queue: queue.length,
      requests: [...requests.values()].map((asked) => asked.request),
      ...(model === undefined ? {} : { model }),
      ...(permissionMode === undefined ? {} : { permissionMode }),
      ...(rateLimit === undefined ? {} : { rateLimit }),
    });
    const changed = () => watchers.publish(live());

    const dropRequests = (message: string) => {
      for (const asked of requests.values())
        asked.answer({ behavior: 'deny', message });
    };

    const canUseTool: CanUseTool = (toolName, input, { signal, ...options }) =>
      new Promise((resolve) => {
        const request: ClaudeRequest = { toolName, input, options };
        const answer = (result: PermissionResult) => {
          if (!requests.delete(options.requestId)) return;
          changed();
          resolve(result);
        };
        requests.set(options.requestId, { request, answer });
        signal.addEventListener(
          'abort',
          () =>
            answer({ behavior: 'deny', message: 'Claude Code stopped asking' }),
          { once: true },
        );
        current?.log.publish(Out.Requested({ request }));
        changed();
      });

    const connection = yield* driver.open({ ...config.options, canUseTool });

    const write = (uuid: Uuid, prompt: Prompt, steer: boolean) => {
      const message: SDKUserMessage = {
        type: 'user',
        message: { role: 'user', content: prompt },
        parent_tool_use_id: null,
        uuid,
        session_id: config.id,
        ...(steer ? { priority: 'next' as const } : {}),
      };
      connection.write(message);
    };

    const finish = (run: Run, ending: Ending) => {
      run.log.publish(
        Out.Ended({
          ...ending,
          ...(run.at === undefined ? {} : { at: run.at }),
          ...(run.result === undefined ? {} : { result: run.result }),
        }),
      );
      run.log.end();
    };

    const begin = (run: Run) => {
      current = run;
      run.pending.add(run.uuid);
      write(run.uuid, run.prompt, false);
      changed();
    };

    const end = (run: Run, ending: Ending) => {
      if (current !== run) return;
      current = undefined;
      dropRequests('The Run ended');
      finish(run, ending);
      const next = queue.shift();
      if (next === undefined) changed();
      else begin(next);
    };

    const gone = (error: ClaudeError) => {
      if (isGone) return;
      isGone = true;
      const runs = [...(current === undefined ? [] : [current]), ...queue];
      current = undefined;
      queue.length = 0;
      dropRequests(error.message);
      for (const run of runs) {
        if (started) finish(run, { status: 'failed', error: error.message });
        else run.log.fail(error);
      }
      watchers.end();
      Deferred.doneUnsafe(goneSignal, Exit.void);
    };

    const onMessage = (message: SDKMessage) => {
      const wasStarted = started;
      started = true;
      if (message.type === 'rate_limit_event')
        rateLimit = message.rate_limit_info;
      const init = message.type === 'system' && message.subtype === 'init';
      if (init) {
        model = message.model;
        permissionMode = message.permissionMode;
      }
      if (!wasStarted || init || message.type === 'rate_limit_event') changed();
      if (stale.size > 0) {
        if (message.type === 'result') {
          const uuids = answeredBy(message, stale);
          const old = uuids.some((uuid) => stale.has(uuid));
          if (old) {
            for (const uuid of uuids) stale.delete(uuid);
            return;
          }
          stale.clear();
        } else if (
          message.type === 'user' &&
          'isReplay' in message &&
          current?.pending.has(message.uuid) === true
        )
          stale.clear();
        else return;
      }
      const run = current;
      if (run === undefined) return;
      if (
        message.type === 'user' &&
        'isReplay' in message &&
        run.steers.delete(message.uuid)
      )
        run.log.publish(Out.Steered({ message }));
      else run.log.publish(Out.Record({ record: message }));
      run.at = forkPointOf(message) ?? run.at;
      const dropped = cancelledCommand(message);
      if (dropped !== undefined) run.pending.delete(dropped);
      if (message.type === 'result') {
        run.result = message;
        for (const uuid of answeredBy(message, run.pending))
          run.pending.delete(uuid);
      }
      if (
        run.pending.size === 0 ||
        (run.cancelling && message.type === 'result')
      )
        end(run, endingOf(run));
    };

    yield* Effect.addFinalizer(() =>
      Effect.sync(() =>
        gone(new ClaudeError({ message: 'Claude Code stopped' })),
      ),
    );
    yield* Stream.runForEach(connection.messages, (message) =>
      Effect.sync(() => onMessage(message)),
    ).pipe(
      Effect.as(new ClaudeError({ message: 'Claude Code exited' })),
      Effect.catch((error) => Effect.succeed(error)),
      Effect.flatMap((error) => Effect.sync(() => gone(error))),
      Effect.forkScoped,
    );
    yield* Effect.tryPromise({
      try: () => connection.control.initializationResult(),
      catch: (cause) =>
        new ClaudeError({ message: 'Claude Code did not start', cause }),
    }).pipe(
      Effect.matchEffect({
        onSuccess: () =>
          Effect.sync(() => {
            started = true;
            changed();
          }),
        onFailure: (error) => Effect.sync(() => gone(error)),
      }),
      Effect.forkScoped,
    );
    changed();

    const instance: Instance = {
      start: (prompt, mode) => {
        const joined = current;
        if (mode === 'steer' && joined !== undefined && !joined.cancelling) {
          const uuid = crypto.randomUUID();
          joined.pending.add(uuid);
          joined.steers.add(uuid);
          write(uuid, prompt, true);
          return joined.log.read;
        }
        const run: Run = {
          uuid: crypto.randomUUID(),
          prompt,
          log: makeFeed<Out, ClaudeError>('all'),
          pending: new Set(),
          steers: new Set(),
          at: undefined,
          result: undefined,
          cancelling: false,
        };
        run.log.publish(Out.Started({ id: config.id }));
        if (isGone)
          run.log.fail(new ClaudeError({ message: 'Claude Code exited' }));
        else if (current === undefined) begin(run);
        else {
          queue.push(run);
          run.log.publish(Out.Queued({ position: queue.length }));
          changed();
        }
        return run.log.read;
      },
      respond: (requestId, answer) =>
        Effect.suspend(() => {
          const asked = requests.get(requestId);
          if (asked === undefined)
            return Effect.fail(
              new ClaudeError({
                message: `No request ${requestId} is pending`,
              }),
            );
          asked.answer(answer);
          return Effect.void;
        }),
      cancel: Effect.suspend(() => {
        const run = current;
        if (run === undefined || run.cancelling) return Effect.void;
        run.cancelling = true;
        return Effect.tryPromise(() => connection.control.interrupt()).pipe(
          Effect.ignore,
          Effect.andThen(
            Effect.sleep(CANCEL_GRACE).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  if (current !== run) return;
                  for (const uuid of run.pending) stale.add(uuid);
                  end(run, { status: 'cancelled' });
                }),
              ),
              Effect.forkIn(scope),
            ),
          ),
          Effect.asVoid,
        );
      }),
      watch: watchers.read,
      live,
      control: connection.control,
      gone: Deferred.await(goneSignal),
    };
    return instance;
  });
