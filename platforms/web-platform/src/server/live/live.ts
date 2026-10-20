import type * as cf from '@cloudflare/workers-types';
import { Context, Effect, Layer } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import type { Rpc as EffectRpc } from 'effect/rpc';
import type { Principal } from '@kestack/auth-toolkit';
import { verify } from '@kestack/auth-toolkit/server/http';
import { authAs, type OAuthOptions } from '@kestack/auth-toolkit/server/rpc';
import {
  fromDurableObjectState,
  server,
  type HibernatingSocket,
  type StreamStore,
} from '@kestack/rpc-toolkit/rpc/websocket';
import type { Api } from '../../define/index.ts';

/** The shared sign-in service, as a cloud API checks each call with it.
 * `oauth` lets in Access Tokens for that Resource Server too. */
export interface LiveAuth {
  readonly url: string;
  readonly oauth?: OAuthOptions | undefined;
}

/** One API's handlers in a Live Object, with the services they stand on
 * given: made once each time the object wakes, from its own storage. Who
 * signed a call is given by `liveObject`. */
export type LiveBackend<Rpcs extends EffectRpc.Any> = Layer.Layer<
  EffectRpc.ToHandler<Rpcs>,
  unknown,
  // oxlint-disable-next-line no-explicit-any
  any
>;

// An Effect response as the runtime sends it: an upgrade is the raw
// Response carrying its socket, which converting would lose.
const toWeb = (response: HttpServerResponse.HttpServerResponse): Response => {
  const { body } = response;
  return body._tag === 'Raw' && body.body instanceof Response
    ? body.body
    : HttpServerResponse.toWeb(response);
};

// A socket the runtime hands the object, as the RPC server reads it.
const socketOf = (ws: cf.WebSocket): HibernatingSocket => ({
  ws,
  close: (code, reason) => Effect.sync(() => ws.close(code, reason)),
  serializeAttachment: (value) => ws.serializeAttachment(value),
  deserializeAttachment: <T>() => ws.deserializeAttachment() as T | null,
});

/**
 * Who a WebSocket opening at the cloud is from: the sign-in service's
 * cookie the browser sends on the upgrade (or a Device's bearer), checked
 * as a call's would be. Null when it names nobody; `unavailable` when the
 * sign-in service could not be asked.
 */
export const liveCaller = (
  request: Request,
  auth: LiveAuth,
): Promise<Principal | null | 'unavailable'> =>
  verify(request, auth).catch(() => 'unavailable' as const);

/** The header `createServer` names a Live Object's owner by, set on every
 * request it forwards there, whatever the caller sent. */
export const LIVE_OWNER = 'x-kstack-live-owner';

/** `request` as forwarded to the Live Object of `owner`. */
export const forOwner = (request: Request, owner: string): Request => {
  const headers = new Headers(request.headers);
  headers.set(LIVE_OWNER, owner);
  return new Request(request, { headers });
};

// Where the object keeps whom it was opened for, beside the app's own keys.
const OWNER_KEY = '@kestack/web-platform/live/owner';

// Each socket's Connection, by the id its own notes keep, so it outlives
// the object's sleep.
const CONNECTION_PREFIX = '@kestack/web-platform/live/connection/';
const SOCKET = 'x-kstack-live-socket';
const Socket = Context.Reference<string | null>(
  '@kestack/web-platform/live/Socket',
  { defaultValue: () => null },
);

// How long a socket trusts its last check before asking the sign-in
// service again: its Cookie Cache's window, so a revoked Sign-in is shut
// out of a socket no later than out of a call over HTTP.
const RECHECK_MS = 5 * 60 * 1000;

/** Whom a socket was opened for, kept in the object and never sent to the
 * browser: the caller, the cookie (or bearer) it was checked by, asked
 * again once `until` has passed, and when that credential runs out. */
interface Connection {
  readonly caller: Principal;
  readonly credential: Readonly<Record<string, string>>;
  readonly until: number;
  readonly expiresAt: number;
}

// When an Access Token runs out, read from the token itself: it was
// checked already.
const tokenExpiry = (authorization: string | undefined): number => {
  const payload = authorization?.split(' ')[1]?.split('.')[1];
  try {
    const { exp } = JSON.parse(
      atob(payload!.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: unknown };
    return typeof exp === 'number' ? exp * 1000 : Infinity;
  } catch {
    return Infinity;
  }
};

const connectionOf = (
  caller: Principal,
  credential: Readonly<Record<string, string>>,
  now: number,
): Connection => {
  const expiresAt =
    caller.kind === 'session'
      ? new Date(caller.session.expiresAt).getTime()
      : tokenExpiry(credential['authorization']);
  return {
    // Never its Sign-in token.
    caller:
      caller.kind === 'session'
        ? { ...caller, session: { ...caller.session, token: '' } }
        : caller,
    credential,
    until: Math.min(now + RECHECK_MS, expiresAt),
    expiresAt,
  };
};

const credentialOf = (request: Request): Record<string, string> =>
  Object.fromEntries(
    ['cookie', 'authorization'].flatMap((name) => {
      const value = request.headers.get(name);
      return value === null ? [] : [[name, value]];
    }),
  );

/** Why a socket may not open for `caller` (on an object owned by `owner`,
 * when given), as the response to send; null when it may. */
export const refusal = (
  caller: Principal | null | 'unavailable',
  owner?: string,
): Response | null =>
  caller === 'unavailable'
    ? new Response('The sign-in service could not be asked', { status: 503 })
    : caller === null
      ? new Response('Unauthorized', { status: 401 })
      : owner === undefined || caller.user.id === owner
        ? null
        : new Response('Forbidden', { status: 403 });

/** What the runtime calls on a Live Object. */
export interface LiveObject {
  fetch(request: Request): Promise<Response>;
  webSocketMessage(ws: cf.WebSocket, data: string | ArrayBuffer): Promise<void>;
  webSocketClose(ws: cf.WebSocket, code: number, reason: string): Promise<void>;
}

/**
 * A Live Object: a Durable Object class serving one API over hibernatable
 * WebSockets, one object per user, its storage theirs alone. It keeps whom
 * it was first opened for, and opens a socket only for that user, checked
 * by the cookie (or bearer) on its upgrade. Every call on a socket is
 * from that user: a socket carries no cookie per call, so the Guard is
 * given the caller that socket's upgrade was checked as, with its scopes,
 * and a call expecting another User is still refused Account Changed. The
 * object keeps each socket's cookie (or bearer) and asks the sign-in
 * service again once the last check is five minutes old or the Sign-in or
 * Access Token has run out, so a call on a socket whose Sign-in has ended
 * is refused Unauthenticated. `backend` makes the API's
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
  readonly streams?: (state: cf.DurableObjectState) => StreamStore;
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

    readonly #storage: cf.DurableObjectStorage;
    #owner: Promise<string | undefined> | undefined;

    constructor(state: cf.DurableObjectState, env: Env) {
      this.#storage = state.storage;
      const { state: hibernation, upgrade } = fromDurableObjectState(state);
      // Who a call is from: the caller its own socket was opened for. A
      // failure, the sign-in service not answering, is the Guard's
      // Unavailable.
      const caller = Effect.flatMap(Socket, (id) =>
        id === null
          ? Effect.succeed(null)
          : Effect.tryPromise(() => this.#callerOf(id)),
      );
      const handlers = Layer.merge(
        authAs(caller),
        options.backend(env, state.storage),
      ) as Layer.Layer<
        | EffectRpc.ToHandler<Rpcs>
        | EffectRpc.Middleware<Rpcs>
        | EffectRpc.ServicesServer<Rpcs>
      >;
      this.#served = Effect.runPromise(
        Effect.gen(function* () {
          const rpc = yield* server(options.api.group, handlers, {
            state: hibernation,
            upgrade,
            connection: {
              tag: Socket,
              initial: (request) =>
                Effect.succeed(request.headers[SOCKET] ?? null),
            },
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

    // The caller of socket `id`, checked again by the sign-in service once
    // its last check is old or its credential has run out; null, and the
    // socket's Connection forgotten, once it no longer names them.
    readonly #callerOf = async (id: string): Promise<Principal | null> => {
      const key = CONNECTION_PREFIX + id;
      const kept = await this.#storage.get<Connection>(key);
      if (kept === undefined) return null;
      const now = Date.now();
      if (now < kept.until) return kept.caller;
      const again =
        now < kept.expiresAt
          ? await verify(
              new Request('https://live.invalid', {
                headers: kept.credential,
              }),
              options.auth,
            )
          : null;
      if (again === null || again.user.id !== kept.caller.user.id) {
        await this.#storage.delete(key);
        return null;
      }
      const next = connectionOf(again, kept.credential, now);
      await this.#storage.put(key, next);
      return next.caller;
    };

    // Whom the object was first opened for, read once per wake.
    readonly #pinned = () =>
      (this.#owner ??= this.#storage.get<string>(OWNER_KEY));

    async fetch(request: Request): Promise<Response> {
      const owner = request.headers.get(LIVE_OWNER);
      if (owner === null) return new Response('Forbidden', { status: 403 });
      const pinned = await this.#pinned();
      if (pinned === undefined) {
        await this.#storage.put(OWNER_KEY, owner);
        this.#owner = Promise.resolve(owner);
      } else if (pinned !== owner)
        return new Response('Forbidden', { status: 403 });
      const caller = await liveCaller(request, options.auth);
      const refused = refusal(caller, owner);
      if (refused !== null) return refused;
      const now = Date.now();
      await this.#forgetEnded(now);
      const id = crypto.randomUUID();
      const credential = credentialOf(request);
      await this.#storage.put(
        CONNECTION_PREFIX + id,
        connectionOf(caller as Principal, credential, now),
      );
      const headers = new Headers(request.headers);
      headers.set(SOCKET, id);
      return (await this.#served).accept(new Request(request, { headers }));
    }

    // A closed socket's Connection is not told apart from an open one's, so
    // each is forgotten once its credential has run out.
    readonly #forgetEnded = async (now: number) => {
      const kept = await this.#storage.list<Connection>({
        prefix: CONNECTION_PREFIX,
      });
      const ended = [...kept]
        .filter(([, connection]) => connection.expiresAt <= now)
        .map(([key]) => key);
      if (ended.length > 0) await this.#storage.delete(ended);
    };

    async webSocketMessage(ws: cf.WebSocket, data: string | ArrayBuffer) {
      await (await this.#served).message(ws, data);
    }

    async webSocketClose(ws: cf.WebSocket, code: number, reason: string) {
      await (await this.#served).close(ws, code, reason);
    }
  };
