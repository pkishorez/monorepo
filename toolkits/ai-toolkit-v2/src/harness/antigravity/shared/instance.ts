import {
  client,
  type ClientContext,
  type ContentBlock,
  type CreateElicitationResponse,
  type JsonRpcId,
  methods,
  type PromptResponse,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type SessionModeState,
  type SessionNotification,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
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
import {
  AntigravityError,
  type Answer,
  type Flags,
  type Live,
  type Request,
  type RunInput,
} from '../contract/index.ts';
import { call, connect } from './driver.ts';
import { Out } from './out.ts';

export interface Run {
  readonly elements: Array<Out>;
  readonly size: SubscriptionRef.SubscriptionRef<number>;
  readonly prompts: Array<Array<ContentBlock>>;
  readonly end: Deferred.Deferred<Out>;
  closed: boolean;
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
  readonly sessionId: string;
  readonly modes?: SessionModeState | null;
  readonly configOptions?: Array<SessionConfigOption> | null;
}

export interface Instance {
  readonly id: string;
  readonly agent: ClientContext;
  readonly live: SubscriptionRef.SubscriptionRef<Live>;
  readonly gone: Deferred.Deferred<void>;
  readonly hold: Effect.Effect<void, never, Scope.Scope>;
  readonly submit: (input: RunInput) => Effect.Effect<Run | undefined>;
  readonly join: (
    message: Array<ContentBlock>,
  ) => Effect.Effect<Run | undefined>;
  readonly respond: (
    requestId: JsonRpcId,
    answer: Answer,
  ) => Effect.Effect<void, AntigravityError>;
  readonly cancel: Effect.Effect<void>;
  readonly setConfigOption: (
    request: SetSessionConfigOptionRequest,
  ) => Effect.Effect<SetSessionConfigOptionResponse, AntigravityError>;
  readonly stop: Effect.Effect<void>;
}

export interface Options {
  readonly cwd: string;
  readonly flags: Flags | undefined;
  readonly linger: Duration.Input;
  readonly parent: Scope.Scope;
  readonly open: (
    agent: ClientContext,
  ) => Effect.Effect<Opened, AntigravityError>;
  readonly onGone: (instance: Instance) => Effect.Effect<void>;
}

const failed = (message: string) =>
  Out.Ended({ status: 'failed', error: new AntigravityError({ message }) });

const ended = (result: PromptResponse) =>
  Out.Ended({
    status: result.stopReason === 'cancelled' ? 'cancelled' : 'completed',
    result,
  });

const cancelled = (request: Request): Answer =>
  request.method === 'elicitation/create'
    ? { action: 'cancel' }
    : { outcome: { outcome: 'cancelled' } };

const changed = (
  live: Live,
  notification: SessionNotification,
  outside: boolean,
): Live | undefined => {
  const update = notification.update;
  const fields: Partial<Live> =
    update.sessionUpdate === 'current_mode_update' && live.modes
      ? { modes: { ...live.modes, currentModeId: update.currentModeId } }
      : update.sessionUpdate === 'config_option_update'
        ? { configOptions: update.configOptions }
        : update.sessionUpdate === 'available_commands_update'
          ? { commands: update.availableCommands }
          : {};
  const all = outside ? { ...fields, update: notification } : fields;
  return Object.keys(all).length === 0 ? undefined : { ...live, ...all };
};

const push = (run: Run, out: Out) =>
  Effect.suspend(() => {
    run.elements.push(out);
    return SubscriptionRef.set(run.size, run.elements.length);
  });

export const make = Effect.fn('Antigravity.instance')(function* (
  options: Options,
) {
  const scope = yield* Scope.fork(options.parent);
  const context = yield* Effect.context<never>();
  const runSync = Effect.runSyncWith(context);
  const runPromise = Effect.runPromiseWith(context);
  const pending = new Map<
    JsonRpcId,
    { readonly request: Request; readonly answer: Deferred.Deferred<Answer> }
  >();
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
    requests: [...pending.values()].map((entry) => entry.request),
  }));

  const onUpdate = (notification: SessionNotification) =>
    Effect.gen(function* () {
      const run = state.current;
      if (state.live) {
        const next = changed(
          yield* SubscriptionRef.get(state.live),
          notification,
          run === undefined,
        );
        if (next) yield* SubscriptionRef.set(state.live, next);
      }
      if (run) yield* push(run, Out.Record({ record: notification }));
    });

  const ask = (request: Request) =>
    Effect.gen(function* () {
      const answer = yield* Deferred.make<Answer>();
      pending.set(request.id, { request, answer });
      yield* syncRequests;
      if (state.current) yield* push(state.current, Out.Requested({ request }));
      return yield* Deferred.await(answer);
    }).pipe(
      Effect.ensuring(
        Effect.suspend(() => {
          pending.delete(request.id);
          return syncRequests;
        }),
      ),
    );

  const app = client({ name: '@kestack/ai-toolkit-v2' })
    .onNotification(methods.client.session.update, ({ params }) =>
      runSync(onUpdate(params)),
    )
    .onRequest(
      methods.client.session.requestPermission,
      ({ params, requestId, signal }) =>
        runPromise(
          ask({ method: 'session/request_permission', id: requestId, params }),
          { signal },
        ) as Promise<RequestPermissionResponse>,
    )
    .onRequest(
      methods.client.elicitation.create,
      ({ params, requestId, signal }) =>
        runPromise(
          ask({ method: 'elicitation/create', id: requestId, params }),
          { signal },
        ) as Promise<CreateElicitationResponse>,
    );

  const { connection, initialize } = yield* connect(
    options.cwd,
    options.flags,
    app,
  ).pipe(
    Scope.provide(scope),
    Effect.onError(() => Scope.close(scope, Exit.void)),
  );
  const agent = connection.agent;
  const live = yield* SubscriptionRef.make<Live>({
    id: '',
    status: 'starting',
    queue: 0,
    requests: [],
    cwd: options.cwd,
    initialize,
    commands: [],
  });
  state.live = live;
  const opened = yield* options
    .open(agent)
    .pipe(Effect.onError(() => Scope.close(scope, Exit.void)));
  const id = opened.sessionId;
  yield* SubscriptionRef.update(live, (now): Live => ({
    ...now,
    id,
    status: 'ready',
    ...(opened.modes === undefined ? {} : { modes: opened.modes }),
    ...(opened.configOptions === undefined
      ? {}
      : { configOptions: opened.configOptions }),
  }));
  const gone = yield* Deferred.make<void>();

  const leave = Effect.gen(function* () {
    if (!(yield* Deferred.succeed(gone, undefined))) return;
    for (const entry of pending.values()) {
      yield* Deferred.interrupt(entry.answer);
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

  const settle = (run: Run, index: number, out: Out) =>
    Effect.suspend(() => {
      if (run.closed) return Effect.void;
      const next = run.prompts[index + 1];
      if (next !== undefined) return push(run, Out.Steered({ message: next }));
      run.closed = true;
      return Deferred.succeed(run.end, out);
    });

  const prompt = (run: Run, index: number) =>
    call(() =>
      agent.request(methods.agent.session.prompt, {
        sessionId: id,
        prompt: run.prompts[index] ?? [],
      }),
    ).pipe(
      Effect.match({
        onSuccess: ended,
        onFailure: (error) => Out.Ended({ status: 'failed', error }),
      }),
      Effect.flatMap((out) => settle(run, index, out)),
      Effect.forkIn(scope),
    );

  const turn = (run: Run, input: RunInput) =>
    Effect.gen(function* () {
      for (const value of input.config ?? []) {
        yield* call(() =>
          agent.request(methods.agent.session.setConfigOption, {
            ...value,
            sessionId: id,
          }),
        );
      }
      yield* prompt(run, 0);
      return yield* Deferred.await(run.end);
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed(Out.Ended({ status: 'failed', error })),
      ),
    );

  const submit = (input: RunInput) =>
    Effect.gen(function* () {
      if (yield* Deferred.isDone(gone)) return undefined;
      const run: Run = {
        elements: [Out.Started({ id })],
        size: yield* SubscriptionRef.make(1),
        prompts: [input.prompt],
        end: yield* Deferred.make<Out>(),
        closed: false,
      };
      const previous = state.tail;
      const mine = yield* Deferred.make<void>();
      state.tail = mine;
      const ahead = state.active;
      state.active += 1;
      yield* retain;
      if (ahead > 0) {
        yield* push(run, Out.Queued({ position: ahead }));
        yield* update((now) => ({ ...now, queue: now.queue + 1 }));
      }
      const finish = (out: Out) =>
        Effect.gen(function* () {
          if (state.current === run) state.current = undefined;
          state.active -= 1;
          yield* update((now) => ({ ...now, status: 'ready' }));
          const dead = connection.signal.aborted;
          if (dead) yield* leave;
          yield* push(run, dead ? failed('agy exited') : out);
          yield* Deferred.succeed(mine, undefined);
          yield* release;
        });
      yield* Effect.gen(function* () {
        if (previous) yield* Deferred.await(previous);
        if (ahead > 0) {
          yield* update((now) => ({ ...now, queue: now.queue - 1 }));
        }
        state.current = run;
        yield* update((now) => ({ ...now, status: 'running' }));
        return yield* Effect.raceFirst(
          turn(run, input),
          Deferred.await(gone).pipe(Effect.map(() => failed('agy exited'))),
        );
      }).pipe(
        Effect.onExit((exit) =>
          finish(
            Exit.isSuccess(exit) ? exit.value : failed('the instance stopped'),
          ),
        ),
        Effect.forkIn(scope),
      );
      return run;
    });

  const join = (message: Array<ContentBlock>) =>
    Effect.suspend(() => {
      const run = state.current;
      if (run === undefined || run.closed) return Effect.succeed(undefined);
      run.prompts.push(message);
      return prompt(run, run.prompts.length - 1).pipe(Effect.as(run));
    });

  const respond = (requestId: JsonRpcId, answer: Answer) =>
    Effect.suspend(() => {
      const entry = pending.get(requestId);
      return entry
        ? Deferred.succeed(entry.answer, answer)
        : Effect.fail(
            new AntigravityError({
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
    for (const entry of pending.values()) {
      yield* Deferred.succeed(entry.answer, cancelled(entry.request));
    }
  });

  const setConfigOption = (request: SetSessionConfigOptionRequest) =>
    call(() =>
      agent.request(methods.agent.session.setConfigOption, request),
    ).pipe(
      Effect.tap((response) =>
        update((now) => ({ ...now, configOptions: response.configOptions })),
      ),
    );

  const self: Instance = {
    id,
    agent,
    live,
    gone,
    hold: Effect.acquireRelease(retain, () => release),
    submit,
    join,
    respond,
    cancel,
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
