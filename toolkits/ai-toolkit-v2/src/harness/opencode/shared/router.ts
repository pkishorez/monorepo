import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Option,
  RcMap,
  Scope,
  Stream,
} from 'effect';
import {
  NotLive,
  type OpenCodeService,
  type Prompt,
  type SessionID,
} from '../contract/index.js';
import { Driver } from './driver.js';
import * as Instance from './instance.js';
import * as Run from './run.js';

export interface RouterOptions {
  readonly linger?: Duration.Input | undefined;
}

export const makeOpenCode = (options: RouterOptions = {}) =>
  Effect.gen(function* () {
    const driver = yield* Driver;
    const scope = yield* Effect.scope;
    const registry = new Map<SessionID, Instance.Instance>();
    const instances: RcMap.RcMap<SessionID, Instance.Instance> =
      yield* RcMap.make({
        lookup: (id: SessionID) =>
          Instance.make(id, driver, RcMap.invalidate(instances, id)).pipe(
            Effect.tap((instance) =>
              Effect.acquireRelease(
                Effect.sync(() => registry.set(id, instance)),
                () =>
                  Effect.sync(() => {
                    if (registry.get(id) === instance) registry.delete(id);
                  }),
              ),
            ),
          ),
        idleTimeToLive: options.linger ?? Duration.seconds(30),
      });

    const submit = (id: SessionID, prompt: Prompt) =>
      Effect.gen(function* () {
        const hold = yield* Scope.fork(scope);
        const instance = yield* RcMap.get(instances, id).pipe(
          Scope.provide(hold),
        );
        const run = yield* instance.submit(prompt);
        yield* Deferred.await(run.done).pipe(
          Effect.ensuring(Scope.close(hold, Exit.void)),
          Effect.forkIn(scope),
        );
        return Run.stream(run);
      });

    const steer = (id: SessionID, prompt: Prompt) =>
      Effect.gen(function* () {
        const joined = yield* RcMap.getOption(instances, id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none<Run.Run>()),
              onSome: (instance) => instance.join(prompt),
            }),
          ),
          Effect.scoped,
        );
        return Option.isSome(joined)
          ? Run.stream(joined.value)
          : yield* submit(id, prompt);
      });

    const existing = (id: SessionID) =>
      RcMap.getOption(instances, id).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new NotLive({ id })),
            onSome: Effect.succeed,
          }),
        ),
      );

    const withLive = <A, E>(
      id: SessionID,
      use: (instance: Instance.Instance) => Effect.Effect<A, E>,
    ) => existing(id).pipe(Effect.flatMap(use), Effect.scoped);

    const service: OpenCodeService = {
      ...driver.methods,
      create: ({ session, prompt }) =>
        Stream.unwrap(
          driver
            .create(session ?? {})
            .pipe(Effect.flatMap((info) => submit(info.id, prompt))),
        ),
      fork: ({ prompt, ...fork }) =>
        Stream.unwrap(
          driver
            .fork(fork)
            .pipe(Effect.flatMap((info) => submit(info.id, prompt))),
        ),
      send: ({ sessionID, prompt, mode }) =>
        Stream.unwrap(
          mode === 'steer'
            ? steer(sessionID, prompt)
            : submit(sessionID, prompt),
        ),
      respond: (id, requestId, answer) =>
        withLive(id, (i) => i.respond(requestId, answer)),
      cancel: (id) => withLive(id, (i) => i.cancel),
      watch: (id) =>
        Stream.unwrap(
          existing(id).pipe(
            Effect.map((i) => i.changes),
            Effect.catchTag('NotLive', () => Effect.succeed(Stream.empty)),
          ),
        ),
      live: Effect.suspend(() =>
        Effect.forEach([...registry.values()], (i) => i.live),
      ).pipe(Effect.map((found) => found.flatMap(Option.toArray))),
      client: driver.client,
    };
    return service;
  });
