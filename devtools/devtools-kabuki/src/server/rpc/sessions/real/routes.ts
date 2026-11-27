import { Effect, Layer, Stream } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { RpcServer } from 'effect/rpc';
import type { Rpc, RpcGroup } from 'effect/rpc';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import { Registry } from '../../../services/registry/contract/index.ts';
import type { Registered } from '../../../services/registry/contract/index.ts';
import {
  SESSION_PATH,
  SESSIONS_PATH,
  serialization,
} from '../../contract/index.ts';
import { KabukiSessionRpcs } from '../../session/contract/index.ts';
import {
  KabukiSessionNotFound,
  KabukiSessionsRpcs,
} from '../contract/index.ts';
import type { KabukiSessionSummary } from '../contract/index.ts';

export interface SessionsOptions {
  readonly origins: ReadonlyArray<string>;
}

type Answered = Layer.Layer<
  Rpc.ToHandler<RpcGroup.Rpcs<typeof KabukiSessionRpcs>>,
  never,
  KabukiSession
>;

const guarded =
  (origins: ReadonlySet<string>) =>
  <E, R>(answer: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) => {
      const origin = request.headers.origin;
      return origin === undefined || origins.has(origin)
        ? answer
        : Effect.succeed(
            HttpServerResponse.text('Forbidden origin.', { status: 403 }),
          );
    });

const summaryOf = ({
  name,
  app,
  environment,
  url,
  origin,
  connectedAt,
}: Registered): KabukiSessionSummary => ({
  name,
  app,
  environment,
  url,
  origin,
  connectedAt,
});

const summaries = (sessions: ReadonlyArray<Registered>) =>
  sessions.map(summaryOf);

export const sessionsRoutes = (options: SessionsOptions, answered: Answered) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      const registry = yield* Registry;
      const guard = guarded(new Set(options.origins));

      const listed = yield* RpcServer.toHttpEffectWebsocket(
        KabukiSessionsRpcs,
      ).pipe(
        Effect.provide(
          yield* KabukiSessionsRpcs.toHandlers({
            list: () => Effect.map(registry.list, summaries),
            watch: () => Stream.map(registry.watch, summaries),
          }),
        ),
        Effect.provide(serialization),
      );
      yield* router.add('GET', SESSIONS_PATH, guard(listed));

      yield* router.add(
        'GET',
        SESSION_PATH,
        guard(
          Effect.gen(function* () {
            const name = (yield* HttpRouter.params).name ?? '';
            const session = yield* registry.find(name);
            if (session === undefined) {
              const available = (yield* registry.list).map((one) => one.name);
              return yield* HttpServerResponse.json(
                new KabukiSessionNotFound({ name, available }),
                { status: 404 },
              );
            }
            const handlers = yield* Layer.build(
              answered.pipe(
                Layer.provide(Layer.succeed(KabukiSession)(session.client)),
              ),
            );
            const forwarded = yield* RpcServer.toHttpEffectWebsocket(
              KabukiSessionRpcs,
              { disableFatalDefects: true },
            ).pipe(Effect.provide(handlers), Effect.provide(serialization));
            return yield* Effect.raceFirst(
              forwarded,
              Effect.as(registry.gone(session), HttpServerResponse.empty()),
            );
          }),
        ),
      );
    }),
  );
