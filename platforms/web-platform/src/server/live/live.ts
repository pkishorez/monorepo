import type * as cf from '@cloudflare/workers-types';
import { Effect, Layer } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import type { Rpc as EffectRpc } from 'effect/rpc';
import type { Api } from '../../define/index.ts';
import { authz } from '@kstackz/auth-toolkit/server/cloud';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';

/** The shared sign-in service, as a cloud API checks each call with it. */
export interface LiveAuth {
  readonly url: string;
  readonly resource?: string | undefined;
}

/** One API's handlers in a Live Object, with the services they stand on
 * given: made once each time the object wakes, from its own storage. */
export type LiveBackend<Rpcs extends EffectRpc.Any> = Layer.Layer<
  EffectRpc.ToHandler<Rpcs> | EffectRpc.Middleware<Rpcs>,
  unknown,
  // oxlint-disable-next-line no-explicit-any
  any
>;

const resolver = (auth: LiveAuth) =>
  authz.cloud({
    authWorkerUrl: auth.url,
    ...(auth.resource !== undefined && { resource: auth.resource }),
  });

// An Effect response as the runtime sends it: an upgrade is the raw
// Response carrying its socket, which converting would lose.
const toWeb = (response: HttpServerResponse.HttpServerResponse): Response => {
  const { body } = response;
  return body._tag === 'Raw' && body.body instanceof Response
    ? body.body
    : HttpServerResponse.toWeb(response);
};

// A socket the runtime hands the object, as the RPC server reads it.
const socketOf = (ws: cf.WebSocket): Rpc.websocket.HibernatingSocket => ({
  ws,
  close: (code, reason) => Effect.sync(() => ws.close(code, reason)),
  serializeAttachment: (value) => ws.serializeAttachment(value),
  deserializeAttachment: <T>() => ws.deserializeAttachment() as T | null,
});

/**
 * Who a WebSocket opening at the cloud is for: the token in its address, as
 * a browser sets no headers on one, checked as a call's would be. Null
 * when it names nobody; `unavailable` when the sign-in service could not
 * be asked.
 */
export const liveUser = (
  request: Request,
  auth: LiveAuth,
): Promise<string | null | 'unavailable'> => {
  const token = new URL(request.url).searchParams.get('access_token');
  if (token === null) return Promise.resolve(null);
  const signed = new Request(request.url, {
    headers: { authorization: `Bearer ${token}` },
  });
  return Effect.runPromise(
    Authz.Resolver.use((found) => found.resolve(signed)).pipe(
      Effect.map((resolution) => resolution?.current.user.id ?? null),
      Effect.catch(() => Effect.succeed('unavailable' as const)),
      Effect.provide(resolver(auth)),
    ),
  );
};

/** What the runtime calls on a Live Object. */
export interface LiveObject {
  fetch(request: Request): Promise<Response>;
  webSocketMessage(ws: cf.WebSocket, data: string | ArrayBuffer): Promise<void>;
  webSocketClose(ws: cf.WebSocket, code: number, reason: string): Promise<void>;
}

/**
 * A Live Object: a Durable Object class serving one API over hibernatable
 * WebSockets, one object per user, its storage theirs alone. Every call is
 * still checked, by the token it carries. `backend` makes the API's
 * handlers from the object's own storage, and `streams` where open streams
 * are kept while it sleeps (in the sockets' own notes, about 2 KB each,
 * when not given). Export it from the Worker by the name its binding has.
 */
export const liveObject = <Rpcs extends EffectRpc.Any, Env>(options: {
  readonly api: Api<Rpcs>;
  readonly backend: (
    env: Env,
    storage: cf.DurableObjectStorage,
  ) => LiveBackend<Rpcs>;
  readonly auth: LiveAuth;
  readonly streams?: (state: cf.DurableObjectState) => Rpc.StreamStore;
}): new (state: cf.DurableObjectState, env: Env) => LiveObject =>
  class implements LiveObject {
    readonly #served: Promise<{
      readonly accept: (request: Request) => Promise<Response>;
      readonly message: (
        socket: cf.WebSocket,
        data: string | ArrayBuffer,
      ) => Promise<void>;
      readonly close: (
        socket: cf.WebSocket,
        code: number,
        reason: string,
      ) => Promise<void>;
    }>;

    constructor(state: cf.DurableObjectState, env: Env) {
      const { state: hibernation, upgrade } =
        Rpc.websocket.fromDurableObjectState(state);
      const handlers = options
        .backend(env, state.storage)
        .pipe(Layer.provide(resolver(options.auth))) as Layer.Layer<
        | EffectRpc.ToHandler<Rpcs>
        | EffectRpc.Middleware<Rpcs>
        | EffectRpc.ServicesServer<Rpcs>
      >;
      this.#served = Effect.runPromise(
        Effect.gen(function* () {
          const rpc = yield* Rpc.websocket.server(options.api.group, handlers, {
            state: hibernation,
            upgrade,
            ...(options.streams !== undefined && {
              streams: options.streams(state),
            }),
          });
          return {
            accept: (request: Request) =>
              Effect.runPromise(
                rpc.accept.pipe(
                  Effect.provideService(
                    HttpServerRequest.HttpServerRequest,
                    HttpServerRequest.fromWeb(request),
                  ),
                  Effect.map(toWeb),
                ),
              ),
            message: (ws: cf.WebSocket, data: string | ArrayBuffer) =>
              Effect.runPromise(rpc.message(socketOf(ws), data)),
            close: (ws: cf.WebSocket, code: number, reason: string) =>
              Effect.runPromise(rpc.close(socketOf(ws), code, reason)),
          };
        }),
      );
    }

    async fetch(request: Request): Promise<Response> {
      return (await this.#served).accept(request);
    }

    async webSocketMessage(ws: cf.WebSocket, data: string | ArrayBuffer) {
      await (await this.#served).message(ws, data);
    }

    async webSocketClose(ws: cf.WebSocket, code: number, reason: string) {
      await (await this.#served).close(ws, code, reason);
    }
  };
