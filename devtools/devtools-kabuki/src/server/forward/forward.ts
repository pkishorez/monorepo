import { Effect, Stream } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { RpcServer } from 'effect/rpc';
import { KabukiSessionApi, serialization } from '../../api/index.ts';
import type { KabukiSessionClient } from '../../api/index.ts';
import { KabukiSessions } from '../registry/index.ts';
import type { KabukiSession } from '../registry/index.ts';
import {
  KabukiSessionNotFound,
  KabukiSessionsApi,
  SESSIONS_PATH,
} from './sessions-api.ts';
import type { KabukiSessionSummary } from './sessions-api.ts';

/*
 * Forward: what DevTools answers its own page and CLI. Both read and move
 * the tabs, so only a request with no Origin, as from the CLI, or with
 * one of DevTools' own, is answered.
 *
 * 1. Guard     refuse every other origin.
 * 2. List      the live Kabuki Sessions, and a stream of them.
 * 3. Forward   one Kabuki Session's Api, by name: each call asked of the
 *              app's own client, streams too. Its socket closes once the
 *              Kabuki Session is gone.
 */

export { dialSession, dialSessions } from './dial.ts';
export {
  KabukiSessionNotFound,
  KabukiSessionSummary,
  KabukiSessionsApi,
  SESSIONS_PATH,
  grouped,
  isLocalEnvironment,
  sessionPath,
} from './sessions-api.ts';
export type {
  AppGroup,
  EnvironmentGroup,
  KabukiSessionsClient,
} from './sessions-api.ts';

export interface ForwardOptions {
  /** The origins of DevTools' own page, as `http://127.0.0.1:14400`. */
  readonly origins: ReadonlyArray<string>;
}

// 1. Guard
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

// 2. List
const summaryOf = ({
  name,
  app,
  environment,
  url,
  origin,
  connectedAt,
}: KabukiSession): KabukiSessionSummary => ({
  name,
  app,
  environment,
  url,
  origin,
  connectedAt,
});

const summaries = (sessions: ReadonlyArray<KabukiSession>) =>
  sessions.map(summaryOf);

// 3. Forward
const forwarding = (client: KabukiSessionClient) =>
  KabukiSessionApi.toHandlers({
    info: () => Effect.orDie(client.info()),
    named: (payload) => Effect.orDie(client.named(payload)),
    history: (payload) => Effect.orDie(client.history(payload)),
    watch: () => Stream.orDie(client.watch()),
    page: () => Stream.orDie(client.page()),
    snapshot: (payload) =>
      client
        .snapshot(payload)
        .pipe(Effect.catchTag('RpcClientError', Effect.die)),
    changes: (payload) =>
      client
        .changes(payload)
        .pipe(Effect.catchTag('RpcClientError', Effect.die)),
    graph: (payload) =>
      client.graph(payload).pipe(Effect.catchTag('RpcClientError', Effect.die)),
    node: (payload) =>
      client.node(payload).pipe(Effect.catchTag('RpcClientError', Effect.die)),
    travel: (payload) =>
      client
        .travel(payload)
        .pipe(Effect.catchTag('RpcClientError', Effect.die)),
    fork: (payload) =>
      client.fork(payload).pipe(Effect.catchTag('RpcClientError', Effect.die)),
  });

/** `/kabuki/sessions` and `/kabuki/session/:name`, as WebSockets, for DevTools' own origins only. */
export const forward = (options: ForwardOptions) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      const sessions = yield* KabukiSessions;
      const guard = guarded(new Set(options.origins));

      const listed = yield* RpcServer.toHttpEffectWebsocket(
        KabukiSessionsApi,
      ).pipe(
        Effect.provide(
          yield* KabukiSessionsApi.toHandlers({
            list: () => Effect.map(sessions.list, summaries),
            watch: () => Stream.map(sessions.watch, summaries),
          }),
        ),
        Effect.provide(serialization),
      );
      yield* router.add('GET', SESSIONS_PATH, guard(listed));

      yield* router.add(
        'GET',
        '/kabuki/session/:name',
        guard(
          Effect.gen(function* () {
            const name = (yield* HttpRouter.params).name ?? '';
            const session = yield* sessions.find(name);
            if (session === undefined) {
              const available = (yield* sessions.list).map((one) => one.name);
              return yield* HttpServerResponse.json(
                new KabukiSessionNotFound({ name, available }),
                { status: 404 },
              );
            }
            const answered = yield* RpcServer.toHttpEffectWebsocket(
              KabukiSessionApi,
              // A defect fails only the call it was in.
              { disableFatalDefects: true },
            ).pipe(
              Effect.provide(yield* forwarding(session.client)),
              Effect.provide(serialization),
            );
            return yield* Effect.raceFirst(
              answered,
              Effect.as(sessions.gone(session), HttpServerResponse.empty()),
            );
          }),
        ),
      );
    }),
  );
