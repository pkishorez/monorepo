import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  RcMap,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  Codex,
  CodexError,
  NotLive,
  type Method,
  type Mode,
  type Params,
  type TurnInput,
} from '../contract/index.ts';
import { Driver, type Connection } from './driver.ts';
import { type Instance, make as makeInstance } from './instance.ts';

export interface Options {
  readonly linger?: Duration.Input;
}

type Open = Effect.Effect<Instance, CodexError, Scope.Scope>;

interface Held {
  readonly instance: Instance;
  readonly release: Effect.Effect<void>;
}

const opened = (
  connection: Connection,
  id: string,
  answer: { readonly cwd: string; readonly model: string },
) => makeInstance(connection, { id, cwd: answer.cwd, model: answer.model });

export const make = (options: Options = {}) =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const instances = new Map<string, Instance>();
    const openers = new Map<string, Open>();

    const map: RcMap.RcMap<string, Instance, CodexError> = yield* RcMap.make({
      lookup: (id: string) =>
        Effect.gen(function* () {
          const open = openers.get(id);
          if (open === undefined)
            return yield* new CodexError({
              message: `Nothing opens Codex thread ${id}`,
            });
          const instance = yield* open;
          instances.set(id, instance);
          const forget = Effect.sync(() => {
            if (instances.get(id) === instance) instances.delete(id);
          });
          yield* Effect.addFinalizer(() => forget);
          yield* Deferred.await(instance.gone).pipe(
            Effect.andThen(forget),
            Effect.forkScoped,
          );
          return instance;
        }),
      idleTimeToLive: options.linger ?? Duration.seconds(30),
    });

    const hold = (
      id: string,
      open: Open,
      retried = false,
    ): Effect.Effect<Held, CodexError> =>
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        openers.set(id, open);
        const instance = yield* RcMap.get(map, id).pipe(
          Scope.provide(scope),
          Effect.onError(() => Scope.close(scope, Exit.void)),
          Effect.ensuring(
            Effect.sync(() => {
              if (openers.get(id) === open) openers.delete(id);
            }),
          ),
        );
        if (!Deferred.isDoneUnsafe(instance.gone))
          return { instance, release: Scope.close(scope, Exit.void) };
        yield* RcMap.invalidate(map, id);
        yield* Scope.close(scope, Exit.void);
        if (retried)
          return yield* new CodexError({
            message: `Codex thread ${id} stopped as soon as it started`,
          });
        return yield* hold(id, open, true);
      });

    const run = (
      open: Effect.Effect<
        { readonly id: string; readonly open: Open },
        CodexError
      >,
      turn: TurnInput,
      mode?: Mode,
    ) =>
      Stream.unwrap(
        Effect.uninterruptible(
          Effect.gen(function* () {
            const target = yield* open;
            const { instance, release } = yield* hold(target.id, target.open);
            return yield* instance.submit(turn, release, mode);
          }),
        ),
      );

    const fresh = (
      start: (
        connection: Connection,
      ) => Effect.Effect<Instance, CodexError, Scope.Scope>,
      cwd: string | undefined,
    ) =>
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        const instance = yield* driver.start(cwd).pipe(
          Effect.flatMap(start),
          Scope.provide(scope),
          Effect.onError(() => Scope.close(scope, Exit.void)),
        );
        return {
          id: instance.id,
          open: Effect.as(
            Effect.addFinalizer(() => Scope.close(scope, Exit.void)),
            instance,
          ),
        };
      });

    const found = (id: string) =>
      Effect.suspend(() => {
        const instance = instances.get(id);
        return instance === undefined
          ? Effect.fail(new NotLive({ id }))
          : Effect.succeed(instance);
      });

    const ask = <M extends Method>(
      method: M,
      params: Params<M>,
      cwd?: string | null,
    ) =>
      Effect.scoped(
        Effect.flatMap(driver.start(cwd ?? undefined), (connection) =>
          connection.request(method, params),
        ),
      );

    return Codex.of({
      create: (input) =>
        run(
          fresh(
            (connection) =>
              connection
                .request('thread/start', input.thread ?? {})
                .pipe(
                  Effect.flatMap((answer) =>
                    opened(connection, answer.thread.id, answer),
                  ),
                ),
            input.thread?.cwd ?? undefined,
          ),
          input.turn,
        ),
      fork: (input) =>
        run(
          fresh(
            (connection) =>
              connection
                .request('thread/fork', { ...input.thread, threadId: input.id })
                .pipe(
                  Effect.flatMap((answer) =>
                    opened(connection, answer.thread.id, answer),
                  ),
                ),
            input.thread?.cwd ?? undefined,
          ),
          input.turn,
        ),
      send: (input) =>
        run(
          Effect.succeed({
            id: input.id,
            open: driver.start(input.thread?.cwd ?? undefined).pipe(
              Effect.flatMap((connection) =>
                connection
                  .request('thread/resume', {
                    ...input.thread,
                    threadId: input.id,
                    excludeTurns: true,
                  })
                  .pipe(
                    Effect.flatMap((answer) =>
                      opened(connection, input.id, answer),
                    ),
                  ),
              ),
            ),
          }),
          input.turn,
          input.mode,
        ),
      respond: (id, requestId, answer) =>
        Effect.flatMap(found(id), (instance) =>
          instance.respond(requestId, answer),
        ),
      cancel: (id) => Effect.flatMap(found(id), (instance) => instance.cancel),
      watch: (id) =>
        Stream.unwrap(
          Effect.map(RcMap.getOption(map, id), (instance) =>
            Option.match(instance, {
              onNone: () => Stream.empty,
              onSome: (instance) =>
                SubscriptionRef.changes(instance.state).pipe(
                  Stream.interruptWhen(Deferred.await(instance.gone)),
                ),
            }),
          ),
        ).pipe(Stream.catch(() => Stream.empty)),
      live: Effect.suspend(() =>
        Effect.forEach([...instances.values()], (instance) =>
          SubscriptionRef.get(instance.state),
        ),
      ),
      request: (id, method, params) =>
        Effect.flatMap(found(id), (instance) =>
          instance.request(method, params),
        ),
      compact: (id) =>
        Effect.flatMap(found(id), (instance) =>
          Effect.asVoid(
            instance.request('thread/compact/start', { threadId: id }),
          ),
        ),
      models: (params = {}) => ask('model/list', params),
      account: (params = {}) => ask('account/read', params),
      rateLimits: (params = {}) => ask('account/rateLimits/read', params),
      usage: (params = {}) => ask('account/usage/read', params),
      threads: (params = {}) => ask('thread/list', params),
      read: (params) => ask('thread/read', params),
      skills: (params = {}) => ask('skills/list', params, params.cwds?.[0]),
      mcpStatus: (params = {}) => ask('mcpServerStatus/list', params),
      config: (params = {}) => ask('config/read', params, params.cwd),
    });
  });

export const layer = (options: Options = {}) =>
  Layer.effect(Codex, make(options));
