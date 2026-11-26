import { Cause, Deferred, Effect, Exit, Schedule, Stream } from 'effect';
import {
  HttpRouter,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { RpcClient } from 'effect/rpc';
import { Socket } from 'effect/socket';
import {
  CONNECT_PATH,
  ServedRpcs,
  serialization,
} from '../../../rpc/contract/index.ts';
import { Registry } from '../../../services/registry/contract/index.ts';
import { dialedOf } from '../contract/index.ts';

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
    const client = yield* RpcClient.make(ServedRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, protocol),
    );
    return { client, closed: Deferred.await(closed) };
  });

const goingDown = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) &&
  Exit.hasInterrupts(exit) &&
  !exit.cause.reasons.some(
    (reason) =>
      Cause.isInterruptReason(reason) &&
      reason.annotations.has(HttpServerError.ClientAbort.key),
  );

export const accept = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const registry = yield* Registry;
    yield* router.add(
      'GET',
      CONNECT_PATH,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const asked = {
          ...dialedOf(request.url),
          origin: request.headers.origin ?? null,
        };
        const socket = yield* request.upgrade;
        const { client, closed } = yield* clientOver(socket);
        const session = yield* Effect.acquireRelease(
          registry.add({ ...asked, client }),
          (session, exit) =>
            goingDown(exit) ? Effect.void : registry.remove(session),
        );
        yield* Effect.ignore(client.named({ name: session.name }));
        yield* client.page().pipe(
          Stream.runForEach((url) => registry.moved(session, url)),
          Effect.ignore,
          Effect.forkChild,
        );
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
