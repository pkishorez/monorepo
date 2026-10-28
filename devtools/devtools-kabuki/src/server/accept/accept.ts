import { Deferred, Effect, Schedule } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { RpcClient } from 'effect/rpc';
import { Socket } from 'effect/socket';
import {
  CONNECT_PATH,
  KabukiSessionApi,
  serialization,
} from '../../api/index.ts';
import { KabukiSessions } from '../registry/index.ts';

/*
 * Accept: a Kabuki Session dials `/kabuki/connect`, from any origin, and
 * DevTools keeps it for as long as the socket stays open.
 *
 * 1. Read     who dials: the name, page and app of its query, and the
 *             origin its browser said.
 * 2. Client   the Kabuki Session Api, asked over the accepted socket. The
 *             app redials on its own, so the client never does.
 * 3. Keep     it under a name of its own, tell the app that name, and
 *             forget it once the socket closes.
 */

// 1. Read
const dialed = (request: HttpServerRequest.HttpServerRequest) => {
  const query = new URL(request.url, 'http://devtools').searchParams;
  const app = query.get('app') ?? '';
  return {
    app,
    url: query.get('url') ?? '',
    name: query.get('name') || app || 'kabuki',
    origin: request.headers.origin ?? null,
  };
};

// 2. Client
/** The Api client over `socket`, and a signal done once the socket closes. */
const clientOver = (socket: Socket.Socket) =>
  Effect.gen(function* () {
    const closed = yield* Deferred.make<void>();
    const protocol = yield* RpcClient.makeProtocolSocket({
      retryTransientErrors: false,
      retryPolicy: Schedule.recurs(0),
    }).pipe(
      Effect.provideService(Socket.Socket, socket),
      Effect.provideService(RpcClient.ConnectionHooks, {
        onConnect: Effect.void,
        onDisconnect: Deferred.succeed(closed, undefined),
      }),
      Effect.provide(serialization),
    );
    const client = yield* RpcClient.make(KabukiSessionApi).pipe(
      Effect.provideService(RpcClient.Protocol, protocol),
    );
    return { client, closed: Deferred.await(closed) };
  });

// 3. Keep
/** The `/kabuki/connect` route: each Kabuki Session that dials, kept while its socket is open. */
export const accept = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const sessions = yield* KabukiSessions;
    yield* router.add(
      'GET',
      CONNECT_PATH,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const asked = dialed(request);
        const socket = yield* request.upgrade;
        const { client, closed } = yield* clientOver(socket);
        const session = yield* Effect.acquireRelease(
          sessions.add({ ...asked, client }),
          sessions.remove,
        );
        // A socket that fails this is closing, and is forgotten just below.
        yield* Effect.ignore(client.named({ name: session.name }));
        yield* closed;
        return HttpServerResponse.empty();
      }).pipe(
        Effect.catchTag('HttpServerError', () =>
          Effect.succeed(
            HttpServerResponse.text('A Kabuki Session dials a WebSocket.', {
              status: 426,
            }),
          ),
        ),
      ),
    );
  }),
);
