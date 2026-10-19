import type * as cf from '@cloudflare/workers-types';
import { DurableObject } from 'cloudflare:workers';
import { Effect, Layer, Scope } from 'effect';
import {
  FetchHttpClient,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import type { RpcClient } from 'effect/rpc';
import { authAs } from '@kestack/auth-toolkit/server/rpc';
import { Rpc } from '@kestack/rpc-toolkit/rpc';
import { ConsoleApi } from '../../shared/contracts/console-api/index.ts';
import type { Member } from '../../shared/contracts/member/index.ts';
import { principalOf, senderOf, sentBy, SocketCaller } from './caller.ts';
import { socketOf } from './socket.ts';
import { Storage } from './services/storage/index.ts';
import { sessionHandlers } from './workflows/session/index.ts';

/*
 * The User Space: one Durable Object per user, holding that user's records
 * and serving their Console API (ADR 0004). This file is its composition
 * root: it builds the services once per object, gives them to every
 * workflow, and serves the workflows' handlers to the user's tabs over
 * hibernating WebSockets and to the Worker's Loaders over HTTP.
 *
 * Registering more:
 * - a service is a nested module under `services/<name>/`, built in
 *   `services` below, which every workflow can then require;
 * - a workflow is a nested module under `workflows/<name>/` exporting its
 *   handlers as an Effect (see `workflows/session`), spread into `handlers`
 *   below, beside a group merged into `ConsoleApi`.
 */

/** Every service, built once for the life of the object. */
const services = (state: cf.DurableObjectState) => Storage.layer(state.storage);

/** Every workflow's handlers, served as one `ConsoleApi`. */
const handlers = ConsoleApi.toLayer(
  Effect.gen(function* () {
    return {
      ...(yield* sessionHandlers),
    };
  }),
);

const unauthorized = HttpServerResponse.text('Unauthorized', { status: 401 });

/** The object's entry points: its fetch, and the callbacks of the sockets it hibernates. */
const serve = (state: cf.DurableObjectState) =>
  Effect.gen(function* () {
    const built = yield* Layer.build(services(state));
    const served = handlers.pipe(Layer.provide(Layer.succeedContext(built)));

    // A socket's caller is said once, at its upgrade, and kept with it.
    const sockets = yield* Rpc.websocket.server(
      ConsoleApi,
      Layer.merge(
        served,
        authAs(
          Effect.map(SocketCaller, (caller) =>
            caller === null ? null : principalOf(caller),
          ),
        ),
      ),
      {
        ...Rpc.websocket.fromDurableObjectState(state),
        streams: Rpc.websocket.streams.sqlite({ storage: state.storage }),
        connection: {
          tag: SocketCaller,
          initial: (request) => {
            const caller = senderOf(request.headers);
            return caller === null
              ? Effect.fail(unauthorized)
              : Effect.succeed(caller);
          },
        },
      },
    );

    // A Loader's call says its caller in each request.
    const http = (request: Request) => {
      const caller = senderOf(Object.fromEntries(request.headers));
      if (caller === null)
        return Promise.resolve(HttpServerResponse.toWeb(unauthorized));
      return Rpc.http.server(
        ConsoleApi,
        Layer.merge(served, authAs(Effect.succeed(principalOf(caller)))),
      )(request);
    };

    return {
      fetch: (request: Request): Promise<Response> =>
        request.headers.get('upgrade')?.toLowerCase() === 'websocket'
          ? Effect.runPromise(
              sockets.accept.pipe(
                Effect.provideService(
                  HttpServerRequest.HttpServerRequest,
                  HttpServerRequest.fromWeb(request),
                ),
                Effect.map((response) => HttpServerResponse.toWeb(response)),
              ),
            )
          : http(request),
      message: (socket: cf.WebSocket, data: string | ArrayBuffer) =>
        Effect.runPromise(sockets.message(socketOf(socket), data)),
      close: (socket: cf.WebSocket, code: number, reason: string) =>
        Effect.runPromise(sockets.close(socketOf(socket), code, reason)),
    };
  });

type Served = Effect.Success<ReturnType<typeof serve>>;

export class UserSpace extends DurableObject {
  readonly #served: Promise<Served>;

  constructor(state: DurableObjectState, env: Cloudflare.Env) {
    super(state, env);
    // Built once per activation, and lives as long as it does.
    const scope = Scope.makeUnsafe();
    // `cloudflare:workers` names its own copy of the workerd types.
    this.#served = Effect.runPromise(
      serve(state as unknown as cf.DurableObjectState).pipe(
        Scope.provide(scope),
      ),
    );
  }

  override async fetch(request: Request): Promise<Response> {
    return (await this.#served).fetch(request);
  }

  override async webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    await (await this.#served).message(socket as unknown as cf.WebSocket, data);
  }

  override async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    await (
      await this.#served
    ).close(socket as unknown as cf.WebSocket, code, reason);
  }
}

/** The member's own User Space, as the Worker reaches it. */
export const reach = (
  namespace: DurableObjectNamespace<UserSpace>,
  member: Member,
) => {
  const stub = namespace.getByName(member.userId);
  return {
    /** Hands the browser's socket upgrade to it, as `member`. */
    socket: (request: Request): Promise<Response> =>
      stub.fetch(sentBy(request, member)),
    /** Calls its Console API over HTTP, as `member`: `RpcClient.make(ConsoleApi)` on it. */
    api: Rpc.http
      .client(ConsoleApi, { url: 'https://user-space/rpc' })
      .pipe(
        Layer.provide(
          Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
            stub.fetch(sentBy(new Request(input, init), member)),
          ),
        ),
      ) satisfies Layer.Layer<RpcClient.Protocol>,
  };
};
