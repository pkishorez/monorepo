import {
  client,
  type ClientContext,
  type CreateElicitationResponse,
  type InitializeResponse,
  type JsonRpcId,
  methods,
  PROTOCOL_VERSION,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type SessionId,
  type SessionModeState,
  type SessionNotification,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
} from '@agentclientprotocol/sdk/unstable';
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Duration } from 'effect';
import { AcpError } from '../contract/index.ts';
import type { Answer, Live, Pending, RunOptions } from '../contract/index.ts';
import { AcpDriver } from './driver.ts';
import { Out } from './out.ts';

export const call = <A>(f: () => Promise<A>) =>
  Effect.tryPromise({
    try: f,
    catch: (cause) =>
      new AcpError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

export const connect = (cwd: string | undefined, app = client()) =>
  Effect.gen(function* () {
    const driver = yield* AcpDriver;
    const connection = yield* driver.connect(app, cwd);
    const initialize = yield* call(() =>
      connection.agent.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          elicitation: { form: {} },
        },
        clientInfo: { name: '@kestack/ai-toolkit-v2', version: '0.0.0' },
      }),
    );
    return { connection, initialize };
  });

export interface Run {
  readonly elements: Array<Out>;
  readonly size: SubscriptionRef.SubscriptionRef<number>;
}

export const read = (run: Run): Stream.Stream<Out> =>
  SubscriptionRef.changes(run.size).pipe(
    Stream.mapAccum(
      () => 0,
      (emitted, size) => [size, run.elements.slice(emitted, size)] as const,
    ),
    Stream.takeUntil((out) => out._tag === 'Ended'),
  );

export interface Opened {
  readonly sessionId: SessionId;
  readonly modes?: SessionModeState | null | undefined;
  readonly configOptions?: Array<SessionConfigOption> | null | undefined;
}

export interface Instance {
  readonly id: SessionId;
  readonly agent: ClientContext;
  readonly initialize: InitializeResponse;
  readonly live: SubscriptionRef.SubscriptionRef<Live>;
  readonly gone: Deferred.Deferred<void>;
  readonly hold: Effect.Effect<void, never, Scope.Scope>;
  readonly submit: (options: RunOptions) => Effect.Effect<Run>;
  readonly respond: (
    requestId: JsonRpcId,
    answer: Answer,
  ) => Effect.Effect<void, AcpError>;
  readonly cancel: Effect.Effect<void>;
  readonly setMode: (
    request: SetSessionModeRequest,
  ) => Effect.Effect<SetSessionModeResponse, AcpError>;
  readonly setConfigOption: (
    request: SetSessionConfigOptionRequest,
  ) => Effect.Effect<SetSessionConfigOptionResponse, AcpError>;
  readonly stop: Effect.Effect<void>;
}

export interface InstanceOptions {
  readonly cwd: string | undefined;
  readonly linger: Duration.Input;
  readonly parent: Scope.Scope;
  readonly open: (
    agent: ClientContext,
    initialize: InitializeResponse,
  ) => Effect.Effect<Opened, AcpError>;
  readonly onGone: (instance: Instance) => Effect.Effect<void>;
}

interface Waiting {
  readonly pending: Pending;
  readonly answer: (answer: Answer) => Effect.Effect<void, AcpError>;
  readonly cancel: Effect.Effect<void>;
  readonly drop: Effect.Effect<void>;
}

const isPermission = (answer: Answer): answer is RequestPermissionResponse =>
  'outcome' in answer;

const isElicitation = (answer: Answer): answer is CreateElicitationResponse =>
  'action' in answer;

const push = (run: Run, out: Out) =>
  Effect.suspend(() => {
    run.elements.push(out);
    return SubscriptionRef.set(run.size, run.elements.length);
  });

const exited = () =>
  Out.Ended({
    status: 'failed',
    error: new AcpError({ message: 'the agent process exited' }),
  });

const stopped = () =>
  Out.Ended({
    status: 'failed',
    error: new AcpError({ message: 'the instance stopped' }),
  });

export const make = Effect.fn('Acp.instance')(function* (
  options: InstanceOptions,
) {
  const scope = yield* Scope.make();
  const context = yield* Effect.context<never>();
  const runPromise = Effect.runPromiseWith(context);
  const waiting = new Map<JsonRpcId, Waiting>();
  const state: {
    current: Run | undefined;
    tail: Deferred.Deferred<void> | undefined;
    active: number;
    refs: number;
    timer: Fiber.Fiber<void> | undefined;
    live: SubscriptionRef.SubscriptionRef<Live> | undefined;
  } = {
    current: undefined,
    tail: undefined,
    active: 0,
    refs: 0,
    timer: undefined,
    live: undefined,
  };

  const update = (f: (live: Live) => Live) =>
    Effect.suspend(() =>
      state.live ? SubscriptionRef.update(state.live, f) : Effect.void,
    );

  const syncRequests = update((live) => ({
    ...live,
    requests: [...waiting.values()].map((entry) => entry.pending),
  }));

  const onUpdate = (notification: SessionNotification) =>
    Effect.gen(function* () {
      if (state.current) {
        yield* push(state.current, Out.Record({ record: notification }));
      }
      const change = notification.update;
      if (change.sessionUpdate === 'current_mode_update') {
        yield* update((live) => ({
          ...live,
          modes: live.modes && {
            ...live.modes,
            currentModeId: change.currentModeId,
          },
        }));
      }
      if (change.sessionUpdate === 'config_option_update') {
        yield* update((live) => ({
          ...live,
          configOptions: change.configOptions,
        }));
      }
    });

  const ask = <A extends Answer>(
    pending: Pending,
    fits: (answer: Answer) => answer is A,
    cancelled: A,
  ) =>
    Effect.gen(function* () {
      const answer = yield* Deferred.make<A>();
      waiting.set(pending.requestId, {
        pending,
        answer: (value) =>
          fits(value)
            ? Deferred.succeed(answer, value)
            : Effect.fail(
                new AcpError({
                  message: `the answer does not fit ${pending.method}`,
                }),
              ),
        cancel: Deferred.succeed(answer, cancelled),
        drop: Deferred.interrupt(answer),
      });
      yield* syncRequests;
      if (state.current) {
        yield* push(state.current, Out.Requested(pending));
      }
      return yield* Deferred.await(answer);
    }).pipe(
      Effect.ensuring(
        Effect.suspend(() => {
          waiting.delete(pending.requestId);
          return syncRequests;
        }),
      ),
    );

  const app = client({ name: '@kestack/ai-toolkit-v2' })
    .onNotification(methods.client.session.update, ({ params }) =>
      runPromise(onUpdate(params)),
    )
    .onRequest(
      methods.client.session.requestPermission,
      ({ params, requestId, signal }) =>
        runPromise(
          ask(
            {
              requestId,
              method: 'session/request_permission',
              request: params,
            },
            isPermission,
            { outcome: { outcome: 'cancelled' } },
          ),
          { signal },
        ),
    )
    .onRequest(
      methods.client.elicitation.create,
      ({ params, requestId, signal }) =>
        runPromise(
          ask(
            { requestId, method: 'elicitation/create', request: params },
            isElicitation,
            { action: 'cancel' },
          ),
          { signal },
        ),
    );

  const { connection, initialize, opened } = yield* Effect.gen(function* () {
    const { connection, initialize } = yield* connect(options.cwd, app).pipe(
      Scope.provide(scope),
    );
    const opened = yield* options.open(connection.agent, initialize);
    return { connection, initialize, opened };
  }).pipe(Effect.onError(() => Scope.close(scope, Exit.void)));

  const id = opened.sessionId;
  const agent = connection.agent;
  const gone = yield* Deferred.make<void>();
  const live = yield* SubscriptionRef.make<Live>({
    id,
    status: 'ready',
    queue: 0,
    requests: [],
    initialize,
    modes: opened.modes,
    configOptions: opened.configOptions,
  });
  state.live = live;

  const leave = Effect.gen(function* () {
    if (!(yield* Deferred.succeed(gone, undefined))) return;
    for (const entry of waiting.values()) {
      yield* entry.drop;
    }
    yield* options.onGone(self);
  });

  const stop = Effect.uninterruptible(
    leave.pipe(Effect.andThen(Scope.close(scope, Exit.void))),
  );

  const linger = Effect.gen(function* () {
    state.timer = yield* Effect.sleep(options.linger).pipe(
      Effect.andThen(
        Effect.suspend(() => (state.refs === 0 ? stop : Effect.void)),
      ),
      Effect.forkIn(options.parent),
    );
  });

  const retain = Effect.gen(function* () {
    state.refs += 1;
    const timer = state.timer;
    state.timer = undefined;
    if (timer) yield* Fiber.interrupt(timer);
  });

  const release = Effect.suspend(() => {
    state.refs -= 1;
    return state.refs === 0 ? linger : Effect.void;
  });

  const turn = (run: RunOptions) =>
    Effect.gen(function* () {
      if (run.mode !== undefined) {
        const modeId = run.mode;
        yield* call(() =>
          agent.request(methods.agent.session.setMode, {
            sessionId: id,
            modeId,
          }),
        );
      }
      for (const value of run.config ?? []) {
        yield* call(() =>
          agent.request(methods.agent.session.setConfigOption, {
            ...value,
            sessionId: id,
          }),
        );
      }
      const result = yield* call(() =>
        agent.request(methods.agent.session.prompt, {
          sessionId: id,
          prompt: run.prompt,
        }),
      );
      return Out.Ended({
        status: result.stopReason === 'cancelled' ? 'cancelled' : 'completed',
        result,
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Out.Ended({ status: 'failed', error })),
      ),
    );

  const submit = (run: RunOptions) =>
    Effect.gen(function* () {
      const size = yield* SubscriptionRef.make(1);
      const current: Run = { elements: [Out.Started({ id })], size };
      const previous = state.tail;
      const mine = yield* Deferred.make<void>();
      state.tail = mine;
      const ahead = state.active;
      state.active += 1;
      yield* retain;
      if (ahead > 0) {
        yield* push(current, Out.Queued({ position: ahead }));
        yield* update((live) => ({ ...live, queue: live.queue + 1 }));
      }
      const finish = (ended: Out) =>
        Effect.gen(function* () {
          if (state.current === current) state.current = undefined;
          state.active -= 1;
          yield* update((live) => ({ ...live, status: 'ready' }));
          const dead = connection.signal.aborted;
          if (dead) yield* leave;
          yield* push(current, dead ? exited() : ended);
          yield* Deferred.succeed(mine, undefined);
          yield* release;
        });
      yield* Effect.gen(function* () {
        if (previous) yield* Deferred.await(previous);
        if (ahead > 0) {
          yield* update((live) => ({ ...live, queue: live.queue - 1 }));
        }
        state.current = current;
        yield* update((live) => ({ ...live, status: 'running' }));
        return yield* Effect.raceFirst(
          turn(run),
          Deferred.await(gone).pipe(Effect.map(exited)),
        );
      }).pipe(
        Effect.onExit((exit) =>
          finish(Exit.isSuccess(exit) ? exit.value : stopped()),
        ),
        Effect.forkIn(scope),
      );
      return current;
    });

  const respond = (requestId: JsonRpcId, answer: Answer) =>
    Effect.suspend(() => {
      const entry = waiting.get(requestId);
      return entry
        ? entry.answer(answer)
        : Effect.fail(
            new AcpError({
              message: `no pending request ${String(requestId)}`,
            }),
          );
    });

  const cancel = Effect.gen(function* () {
    yield* Effect.promise(() =>
      agent
        .notify(methods.agent.session.cancel, { sessionId: id })
        .catch(() => undefined),
    );
    for (const entry of waiting.values()) {
      yield* entry.cancel;
    }
  });

  const setMode = (request: SetSessionModeRequest) =>
    call(() => agent.request(methods.agent.session.setMode, request)).pipe(
      Effect.tap(() =>
        update((live) => ({
          ...live,
          modes: live.modes && {
            ...live.modes,
            currentModeId: request.modeId,
          },
        })),
      ),
    );

  const setConfigOption = (request: SetSessionConfigOptionRequest) =>
    call(() =>
      agent.request(methods.agent.session.setConfigOption, request),
    ).pipe(
      Effect.tap((response) =>
        update((live) => ({ ...live, configOptions: response.configOptions })),
      ),
    );

  const self: Instance = {
    id,
    agent,
    initialize,
    live,
    gone,
    hold: Effect.acquireRelease(retain, () => release),
    submit,
    respond,
    cancel,
    setMode,
    setConfigOption,
    stop,
  };

  yield* Effect.promise(() => connection.closed.then(noop, noop)).pipe(
    Effect.andThen(leave),
    Effect.forkIn(scope),
  );
  yield* linger;
  return self;
});

const noop = () => undefined;
