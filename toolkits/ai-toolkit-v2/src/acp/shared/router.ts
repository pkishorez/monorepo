import * as acp from '@agentclientprotocol/sdk/unstable';
import { Deferred, Effect, Exit, Stream, SubscriptionRef } from 'effect';
import type { Duration, Scope } from 'effect';
import { AcpError, NotLive } from '../contract/index.ts';
import type {
  AcpAgent,
  Answer,
  CreateInput,
  ForkInput,
  Live,
  SendInput,
} from '../contract/index.ts';
import { AcpDriver } from './driver.ts';
import * as Instance from './instance.ts';

export interface Options {
  readonly linger?: Duration.Input;
}

interface Slot {
  readonly started: Deferred.Deferred<Instance.Instance, AcpError>;
  ready: Instance.Instance | undefined;
}

const refuse = (message: string) => Effect.fail(new AcpError({ message }));

const resume =
  (request: acp.ResumeSessionRequest) =>
  (agent: acp.ClientContext, initialize: acp.InitializeResponse) => {
    const capabilities = initialize.agentCapabilities;
    if (capabilities?.sessionCapabilities?.resume) {
      return Instance.call(() =>
        agent.request(acp.methods.agent.session.resume, request),
      ).pipe(
        Effect.map((response) => ({
          ...response,
          sessionId: request.sessionId,
        })),
      );
    }
    if (capabilities?.loadSession) {
      return Instance.call(() =>
        agent.request(acp.methods.agent.session.load, {
          ...request,
          mcpServers: request.mcpServers ?? [],
        }),
      ).pipe(
        Effect.map((response) => ({
          ...response,
          sessionId: request.sessionId,
        })),
      );
    }
    return refuse(
      `the agent offers neither session/resume nor session/load, so ${request.sessionId} cannot be resumed`,
    );
  };

const fork =
  (request: acp.ForkSessionRequest) =>
  (agent: acp.ClientContext, initialize: acp.InitializeResponse) =>
    initialize.agentCapabilities?.sessionCapabilities?.fork
      ? Instance.call(() =>
          agent.request(acp.methods.agent.session.fork, request),
        )
      : refuse('the agent does not offer session/fork');

export const make = (
  options: Options = {},
): Effect.Effect<AcpAgent, never, AcpDriver | Scope.Scope> =>
  Effect.gen(function* () {
    const driver = yield* AcpDriver;
    const parent = yield* Effect.scope;
    const linger = options.linger ?? '30 seconds';
    const slots = new Map<acp.SessionId, Slot>();

    const onGone = (instance: Instance.Instance) =>
      Effect.sync(() => {
        if (slots.get(instance.id)?.ready === instance) {
          slots.delete(instance.id);
        }
      });

    const start = (cwd: string, open: Instance.InstanceOptions['open']) =>
      Instance.make({ cwd, linger, parent, open, onGone }).pipe(
        Effect.provideService(AcpDriver, driver),
      );

    const register = (instance: Instance.Instance) =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<Instance.Instance, AcpError>();
        yield* Deferred.succeed(started, instance);
        slots.set(instance.id, { started, ready: instance });
        return instance;
      });

    const obtain = (request: acp.ResumeSessionRequest) =>
      Effect.gen(function* () {
        const existing = slots.get(request.sessionId);
        if (existing) return yield* Deferred.await(existing.started);
        const slot: Slot = {
          started: yield* Deferred.make<Instance.Instance, AcpError>(),
          ready: undefined,
        };
        slots.set(request.sessionId, slot);
        return yield* start(request.cwd, resume(request)).pipe(
          Effect.onExit((exit) =>
            Effect.gen(function* () {
              if (Exit.isSuccess(exit)) slot.ready = exit.value;
              else if (slots.get(request.sessionId) === slot) {
                slots.delete(request.sessionId);
              }
              yield* Deferred.done(slot.started, exit);
            }),
          ),
        );
      });

    const find = (id: acp.SessionId) =>
      Effect.suspend(() => {
        const ready = slots.get(id)?.ready;
        return ready ? Effect.succeed(ready) : Effect.fail(new NotLive({ id }));
      });

    const runOn = (
      instance: Effect.Effect<Instance.Instance, AcpError>,
      input: CreateInput | ForkInput | SendInput,
    ) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const ready = yield* instance;
          const run = yield* ready.submit(input);
          return Instance.read(run);
        }),
      );

    const create = (input: CreateInput) =>
      runOn(
        start(input.session.cwd, (agent) =>
          Instance.call(() =>
            agent.request(acp.methods.agent.session.new, input.session),
          ),
        ).pipe(Effect.flatMap(register)),
        input,
      );

    const forkSession = (input: ForkInput) =>
      runOn(
        start(input.session.cwd, fork(input.session)).pipe(
          Effect.flatMap(register),
        ),
        input,
      );

    const send = (input: SendInput) => runOn(obtain(input.session), input);

    const respond = (
      id: acp.SessionId,
      requestId: acp.JsonRpcId,
      answer: Answer,
    ) =>
      find(id).pipe(
        Effect.flatMap((instance) => instance.respond(requestId, answer)),
      );

    const cancel = (id: acp.SessionId) =>
      find(id).pipe(Effect.flatMap((instance) => instance.cancel));

    const watch = (id: acp.SessionId): Stream.Stream<Live> =>
      Stream.unwrap(
        Effect.gen(function* () {
          const slot = slots.get(id);
          if (!slot) return Stream.empty;
          const instance = yield* Deferred.await(slot.started).pipe(
            Effect.option,
          );
          if (instance._tag === 'None') return Stream.empty;
          yield* instance.value.hold;
          return SubscriptionRef.changes(instance.value.live).pipe(
            Stream.interruptWhen(Deferred.await(instance.value.gone)),
          );
        }),
      );

    const live = Effect.suspend(() =>
      Effect.forEach([...slots.entries()], ([id, slot]) =>
        slot.ready
          ? SubscriptionRef.get(slot.ready.live)
          : Effect.succeed<Live>({
              id,
              status: 'starting',
              queue: 0,
              requests: [],
            }),
      ),
    );

    const initialize = Effect.scoped(
      Instance.connect(undefined).pipe(
        Effect.map(({ initialize }) => initialize),
      ),
    ).pipe(Effect.provideService(AcpDriver, driver));

    const listSessions = (request: acp.ListSessionsRequest) =>
      Effect.scoped(
        Effect.gen(function* () {
          const { connection, initialize } = yield* Instance.connect(
            request.cwd ?? undefined,
          );
          if (!initialize.agentCapabilities?.sessionCapabilities?.list) {
            return yield* refuse('the agent does not offer session/list');
          }
          return yield* Instance.call(() =>
            connection.agent.request(acp.methods.agent.session.list, request),
          );
        }),
      ).pipe(Effect.provideService(AcpDriver, driver));

    const setMode = (request: acp.SetSessionModeRequest) =>
      find(request.sessionId).pipe(
        Effect.flatMap((instance) => instance.setMode(request)),
      );

    const setConfigOption = (request: acp.SetSessionConfigOptionRequest) =>
      find(request.sessionId).pipe(
        Effect.flatMap((instance) => instance.setConfigOption(request)),
      );

    const connection = (id: acp.SessionId) =>
      find(id).pipe(Effect.map((instance) => instance.agent));

    yield* Effect.addFinalizer(() =>
      Effect.forEach(
        [...slots.values()],
        (slot) => (slot.ready ? slot.ready.stop : Effect.void),
        { discard: true },
      ),
    );

    return {
      create,
      fork: forkSession,
      send,
      respond,
      cancel,
      watch,
      live,
      initialize,
      listSessions,
      setMode,
      setConfigOption,
      connection,
    };
  });
