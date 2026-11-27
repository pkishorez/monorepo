import type { Options } from '@anthropic-ai/claude-agent-sdk';
import {
  Duration,
  Effect,
  Exit,
  Fiber,
  Scope,
  Semaphore,
  Stream,
} from 'effect';
import {
  ClaudeError,
  NotLive,
  type ClaudeOptions,
  type ClaudeService,
  type Mode,
  type Prompt,
} from '../contract/index.js';
import { ClaudeDriver } from './driver.js';
import { makeInstance, type Instance } from './instance.js';

export interface RouterConfig {
  readonly linger?: Duration.Input;
  readonly env: Record<string, string | undefined>;
  readonly executable: string | undefined;
}

interface Entry {
  readonly instance: Instance;
  readonly scope: Scope.Closeable;
  refs: number;
  linger: Fiber.Fiber<void> | undefined;
}

type Start = Pick<
  Options,
  'resume' | 'sessionId' | 'forkSession' | 'resumeSessionAt'
>;

const INIT_TIMEOUT = Duration.seconds(30);

const attempt = <A>(what: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new ClaudeError({ message: `Claude Code did not ${what}`, cause }),
  });

export const makeClaude = (
  config: RouterConfig,
): Effect.Effect<ClaudeService, never, ClaudeDriver | Scope.Scope> =>
  Effect.gen(function* () {
    const driver = yield* ClaudeDriver;
    const scope = yield* Effect.scope;
    const lock = yield* Semaphore.make(1);
    const linger = config.linger ?? Duration.seconds(30);
    const entries = new Map<string, Entry>();

    const optionsOf = (
      cwd: string,
      options: ClaudeOptions | undefined,
      start: Start,
    ): Options => {
      const executable =
        options?.pathToClaudeCodeExecutable ?? config.executable;
      return {
        ...options,
        cwd,
        ...start,
        ...(executable === undefined
          ? {}
          : { pathToClaudeCodeExecutable: executable }),
        env: {
          ...(options?.env ?? config.env),
          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
        },
        extraArgs: { ...options?.extraArgs, 'replay-user-messages': null },
      };
    };

    const drop = (id: string, instance: Instance) =>
      Effect.suspend(() => {
        const entry = entries.get(id);
        if (entry?.instance !== instance) return Effect.void;
        entries.delete(id);
        return Scope.close(entry.scope, Exit.void);
      });

    const release = (id: string, entry: Entry) =>
      Effect.suspend(() => {
        entry.refs -= 1;
        if (entry.refs > 0) return Effect.void;
        return Effect.sleep(linger).pipe(
          Effect.andThen(
            Effect.suspend(() =>
              entry.refs === 0 ? drop(id, entry.instance) : Effect.void,
            ),
          ),
          Effect.forkIn(scope),
          Effect.map((fiber) => {
            entry.linger = fiber;
          }),
        );
      });

    const take = (entry: Entry) =>
      Effect.suspend(() => {
        entry.refs += 1;
        const fiber = entry.linger;
        entry.linger = undefined;
        return Effect.as(
          fiber === undefined ? Effect.void : Fiber.interrupt(fiber),
          entry,
        );
      });

    const open = (id: string, options: Options) =>
      Effect.gen(function* () {
        const instanceScope = yield* Scope.fork(scope);
        const instance = yield* makeInstance({
          id,
          cwd: options.cwd ?? '',
          options,
        }).pipe(
          Scope.provide(instanceScope),
          Effect.provideService(ClaudeDriver, driver),
          Effect.onError(() => Scope.close(instanceScope, Exit.void)),
        );
        const entry: Entry = {
          instance,
          scope: instanceScope,
          refs: 0,
          linger: undefined,
        };
        entries.set(id, entry);
        yield* instance.gone.pipe(
          Effect.andThen(drop(id, instance)),
          Effect.forkIn(scope),
        );
        return entry;
      });

    const hold = (id: string, options: Options) =>
      Effect.acquireRelease(
        lock.withPermits(1)(
          Effect.suspend(() => {
            const found = entries.get(id);
            return Effect.flatMap(
              found === undefined ? open(id, options) : Effect.succeed(found),
              take,
            );
          }),
        ),
        (entry) => release(id, entry),
      );

    const run = (
      id: string,
      options: Options,
      prompt: Prompt,
      mode: Mode = 'queue',
    ) =>
      Stream.unwrap(
        Effect.uninterruptible(
          Effect.gen(function* () {
            const holder = yield* Scope.fork(scope);
            const entry = yield* hold(id, options).pipe(
              Scope.provide(holder),
              Effect.onError(() => Scope.close(holder, Exit.void)),
            );
            const out = entry.instance.start(prompt, mode);
            yield* Stream.runDrain(out).pipe(
              Effect.ignore,
              Effect.ensuring(Scope.close(holder, Exit.void)),
              Effect.forkIn(scope),
            );
            return out;
          }),
        ),
      );

    const liveOne = (id: string) =>
      Effect.suspend(() => {
        const entry = entries.get(id);
        return entry === undefined
          ? Effect.fail(new NotLive({ id }))
          : Effect.succeed(entry.instance);
      });

    const ask = <A>(
      id: string,
      what: string,
      call: (instance: Instance) => Promise<A>,
    ) =>
      Effect.flatMap(liveOne(id), (instance) =>
        attempt(what, () => call(instance)),
      );

    const sessions = driver.sessions;

    const service: ClaudeService = {
      create: (input) => {
        const id = crypto.randomUUID();
        return run(
          id,
          optionsOf(input.cwd, input.options, { sessionId: id }),
          input.prompt,
        );
      },
      fork: (input) => {
        const id = crypto.randomUUID();
        return run(
          id,
          optionsOf(input.cwd, input.options, {
            resume: input.id,
            forkSession: true,
            sessionId: id,
            ...(input.at === undefined ? {} : { resumeSessionAt: input.at }),
          }),
          input.prompt,
        );
      },
      send: (input) =>
        run(
          input.id,
          optionsOf(input.cwd, input.options, { resume: input.id }),
          input.prompt,
          input.mode,
        ),
      respond: (id, requestId, answer) =>
        Effect.flatMap(liveOne(id), (instance) =>
          instance.respond(requestId, answer),
        ),
      cancel: (id) =>
        Effect.flatMap(liveOne(id), (instance) => instance.cancel),
      watch: (id) =>
        Stream.unwrap(
          Effect.suspend(() => {
            const entry = entries.get(id);
            if (entry === undefined) return Effect.succeed(Stream.empty);
            return Effect.acquireRelease(take(entry), () =>
              release(id, entry),
            ).pipe(Effect.as(entry.instance.watch));
          }),
        ),
      live: Effect.sync(() =>
        [...entries.values()].map((entry) => entry.instance.live()),
      ),

      initialization: (input) =>
        Effect.scoped(
          Effect.flatMap(
            driver.open(optionsOf(input.cwd, input.options, {})),
            (connection) =>
              attempt('start', () => connection.control.initializationResult()),
          ),
        ).pipe(
          Effect.timeoutOrElse({
            duration: INIT_TIMEOUT,
            orElse: () =>
              Effect.fail(
                new ClaudeError({
                  message: 'Claude Code took too long to start',
                }),
              ),
          }),
        ),
      contextUsage: (id) =>
        ask(id, 'report its context usage', (instance) =>
          instance.control.getContextUsage(),
        ),
      mcpServerStatus: (id) =>
        ask(id, 'report its MCP servers', (instance) =>
          instance.control.mcpServerStatus(),
        ),
      setModel: (id, model) =>
        ask(id, 'change model', (instance) => instance.control.setModel(model)),
      setPermissionMode: (id, mode) =>
        ask(id, 'change permission mode', (instance) =>
          instance.control.setPermissionMode(mode),
        ),
      applyFlagSettings: (id, settings) =>
        ask(id, 'apply the settings', (instance) =>
          instance.control.applyFlagSettings(settings),
        ),

      listSessions: (options) =>
        attempt('list sessions', () => sessions.listSessions(options)),
      sessionInfo: (id, options) =>
        attempt('read the session', () => sessions.getSessionInfo(id, options)),
      sessionMessages: (id, options) =>
        attempt('read the session', () =>
          sessions.getSessionMessages(id, options),
        ),
      listSubagents: (id, options) =>
        attempt('list subagents', () => sessions.listSubagents(id, options)),
      subagentMessages: (id, agentId, options) =>
        attempt('read the subagent', () =>
          sessions.getSubagentMessages(id, agentId, options),
        ),
      renameSession: (id, title, options) =>
        attempt('rename the session', () =>
          sessions.renameSession(id, title, options),
        ),
      tagSession: (id, tag, options) =>
        attempt('tag the session', () => sessions.tagSession(id, tag, options)),
      deleteSession: (id, options) =>
        attempt('delete the session', () =>
          sessions.deleteSession(id, options),
        ),
    };
    return service;
  });
