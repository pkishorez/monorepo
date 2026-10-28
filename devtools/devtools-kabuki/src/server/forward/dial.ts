import { Effect, Schedule } from 'effect';
import type { Scope } from 'effect';
import { RpcClient } from 'effect/rpc';
import { Socket } from 'effect/socket';
import { KabukiSessionApi, serialization } from '../../api/index.ts';
import type { KabukiSessionClient } from '../../api/index.ts';
import {
  KabukiSessionsApi,
  SESSIONS_PATH,
  sessionPath,
} from './sessions-api.ts';
import type { KabukiSessionsClient } from './sessions-api.ts';

/*
 * Dial: the clients DevTools' own page and CLI ask with, over a WebSocket
 * to the DevTools Server, in a browser or in Node. A closed socket fails
 * every call after it; dial again for more.
 */

const socketUrl = (devtools: string, path: string) => {
  const url = new URL(path, devtools);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  return url.toString();
};

const protocolTo = (url: string) =>
  Effect.gen(function* () {
    const socket = yield* Socket.makeWebSocket(url);
    return yield* RpcClient.makeProtocolSocket({
      retryTransientErrors: false,
      retryPolicy: Schedule.recurs(0),
    }).pipe(
      Effect.provideService(Socket.Socket, socket),
      Effect.provide(serialization),
    );
  }).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal));

/** The live Kabuki Sessions, asked of the DevTools Server at `devtools` (`http://127.0.0.1:14400`), for as long as the Scope lasts. */
export const dialSessions = (
  devtools: string,
): Effect.Effect<KabukiSessionsClient, never, Scope.Scope> =>
  Effect.flatMap(protocolTo(socketUrl(devtools, SESSIONS_PATH)), (protocol) =>
    RpcClient.make(KabukiSessionsApi).pipe(
      Effect.provideService(RpcClient.Protocol, protocol),
    ),
  );

/**
 * One Kabuki Session's Api, asked through the DevTools Server at
 * `devtools`, for as long as the Scope lasts: the same client the in-page
 * dock gets from `inMemory`. Its calls fail once the Kabuki Session is
 * gone, or if it never was.
 */
export const dialSession = (
  devtools: string,
  name: string,
): Effect.Effect<KabukiSessionClient, never, Scope.Scope> =>
  Effect.flatMap(
    protocolTo(socketUrl(devtools, sessionPath(name))),
    (protocol) =>
      RpcClient.make(KabukiSessionApi).pipe(
        Effect.provideService(RpcClient.Protocol, protocol),
      ),
  );
