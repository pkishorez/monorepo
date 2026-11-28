import {
  type ClientContext,
  type InitializeResponse,
  methods,
  type NewSessionRequest,
} from '@agentclientprotocol/sdk/unstable';
import {
  Deferred,
  Effect,
  Layer,
  Stream,
  SubscriptionRef,
  SynchronizedRef,
} from 'effect';
import type { Duration } from 'effect';
import {
  Antigravity,
  AntigravityError,
  type CreateInput,
  type Flags,
  NotLive,
  type Out,
  type SendInput,
} from '../contract/index.ts';
import { call, connect, Driver } from './driver.ts';
import {
  type Instance,
  make as makeInstance,
  type Options as InstanceOptions,
  read,
} from './instance.ts';

export interface Options {
  readonly linger?: Duration.Input;
}

const withSystemPrompt = (input: CreateInput): NewSessionRequest =>
  input.systemPrompt === undefined
    ? input.session
    : {
        ...input.session,
        _meta: {
          ...input.session._meta,
          antigravity: { systemPrompt: { append: input.systemPrompt } },
        },
      };

export const make = (options: Options = {}) =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const parent = yield* Effect.scope;
    const linger = options.linger ?? '30 seconds';
    const instances = yield* SynchronizedRef.make(new Map<string, Instance>());

    const forget = (instance: Instance) =>
      SynchronizedRef.update(instances, (map) => {
        if (map.get(instance.id) !== instance) return map;
        const next = new Map(map);
        next.delete(instance.id);
        return next;
      });

    const start = (
      cwd: string,
      flags: Flags | undefined,
      open: InstanceOptions['open'],
    ) =>
      makeInstance({ cwd, flags, linger, parent, open, onGone: forget }).pipe(
        Effect.provideService(Driver, driver),
      );

    const find = (id: string) =>
      SynchronizedRef.get(instances).pipe(Effect.map((map) => map.get(id)));

    const found = (id: string) =>
      find(id).pipe(
        Effect.flatMap((instance) =>
          instance
            ? Effect.succeed(instance)
            : Effect.fail(new NotLive({ id })),
        ),
      );

    const resume = (input: SendInput) =>
      SynchronizedRef.modifyEffect(instances, (map) => {
        const live = map.get(input.session.sessionId);
        if (live) return Effect.succeed([live, map] as const);
        return start(input.session.cwd, input.flags, (agent) =>
          call(() =>
            agent.request(methods.agent.session.resume, input.session),
          ).pipe(
            Effect.map((opened) => ({
              ...opened,
              sessionId: input.session.sessionId,
            })),
          ),
        ).pipe(
          Effect.map(
            (instance) =>
              [instance, new Map(map).set(instance.id, instance)] as const,
          ),
        );
      });

    const send = (
      input: SendInput,
      retried = false,
    ): Effect.Effect<Stream.Stream<Out>, AntigravityError> =>
      Effect.gen(function* () {
        if (input.mode === 'steer') {
          const live = yield* find(input.session.sessionId);
          const joined = live ? yield* live.join(input.prompt) : undefined;
          if (joined) return read(joined);
        }
        const instance = yield* resume(input);
        const run = yield* instance.submit(input);
        if (run) return read(run);
        yield* forget(instance);
        if (retried)
          return yield* new AntigravityError({
            message: `agy session ${input.session.sessionId} stopped as soon as it started`,
          });
        return yield* send(input, true);
      });

    const once = <A>(
      flags: Flags | undefined,
      f: (
        agent: ClientContext,
        initialize: InitializeResponse,
      ) => Effect.Effect<A, AntigravityError>,
    ) =>
      Effect.scoped(
        connect(undefined, flags).pipe(
          Effect.flatMap(({ connection, initialize }) =>
            f(connection.agent, initialize),
          ),
        ),
      ).pipe(Effect.provideService(Driver, driver));

    return Antigravity.of({
      create: (input) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const instance = yield* start(
              input.session.cwd,
              input.flags,
              (agent) =>
                call(() =>
                  agent.request(
                    methods.agent.session.new,
                    withSystemPrompt(input),
                  ),
                ),
            );
            yield* SynchronizedRef.update(instances, (map) =>
              new Map(map).set(instance.id, instance),
            );
            const run = yield* instance.submit(input);
            return run
              ? read(run)
              : Stream.fail(new AntigravityError({ message: 'agy exited' }));
          }),
        ),
      send: (input) => Stream.unwrap(send(input)),
      respond: (id, requestId, answer) =>
        found(id).pipe(
          Effect.flatMap((instance) => instance.respond(requestId, answer)),
        ),
      cancel: (id) =>
        found(id).pipe(Effect.flatMap((instance) => instance.cancel)),
      watch: (id) =>
        Stream.unwrap(
          find(id).pipe(
            Effect.flatMap((instance) =>
              instance
                ? instance.hold.pipe(
                    Effect.as(
                      SubscriptionRef.changes(instance.live).pipe(
                        Stream.interruptWhen(Deferred.await(instance.gone)),
                      ),
                    ),
                  )
                : Effect.succeed(Stream.empty),
            ),
          ),
        ),
      live: SynchronizedRef.get(instances).pipe(
        Effect.flatMap((map) =>
          Effect.forEach([...map.values()], (instance) =>
            SubscriptionRef.get(instance.live),
          ),
        ),
      ),
      initialize: (flags) =>
        once(flags, (_, initialize) => Effect.succeed(initialize)),
      listSessions: (request = {}, flags) =>
        once(flags, (agent) =>
          call(() => agent.request(methods.agent.session.list, request)),
        ),
      closeSession: (id) =>
        found(id).pipe(
          Effect.flatMap((instance) =>
            call(() =>
              instance.agent.request(methods.agent.session.close, {
                sessionId: id,
              }),
            ).pipe(Effect.andThen(instance.stop)),
          ),
        ),
      setConfigOption: (request) =>
        found(request.sessionId).pipe(
          Effect.flatMap((instance) => instance.setConfigOption(request)),
        ),
      prompt: driver.print,
      connection: (id) =>
        found(id).pipe(Effect.map((instance) => instance.agent)),
    });
  });

export const layer = (options: Options = {}) =>
  Layer.effect(Antigravity, make(options));
