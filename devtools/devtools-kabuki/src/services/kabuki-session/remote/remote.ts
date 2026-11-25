import { Effect, Layer, Schedule } from 'effect';
import type { Scope } from 'effect';
import { RpcClient } from 'effect/rpc';
import { Socket } from 'effect/socket';
import {
  SESSIONS_PATH,
  serialization,
  sessionPath,
} from '../../../server/rpc/contract/index.ts';
import { KabukiSessionRpcs } from '../../../server/rpc/session/contract/index.ts';
import { KabukiSessionsRpcs } from '../../../server/rpc/sessions/contract/index.ts';
import type { KabukiSessionsClient } from '../../../server/rpc/sessions/contract/index.ts';
import { KabukiSession } from '../contract/index.ts';

const socketUrl = (origin: string, path: string) => {
  const url = new URL(path, origin);
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

export const dialSessions = (
  origin: string,
): Effect.Effect<KabukiSessionsClient, never, Scope.Scope> =>
  Effect.flatMap(protocolTo(socketUrl(origin, SESSIONS_PATH)), (protocol) =>
    RpcClient.make(KabukiSessionsRpcs).pipe(
      Effect.provideService(RpcClient.Protocol, protocol),
    ),
  );

export const remote = (
  origin: string,
  name: string,
): Layer.Layer<KabukiSession> =>
  Layer.effect(KabukiSession)(
    Effect.flatMap(
      protocolTo(socketUrl(origin, sessionPath(name))),
      (protocol) =>
        RpcClient.make(KabukiSessionRpcs).pipe(
          Effect.provideService(RpcClient.Protocol, protocol),
        ),
    ),
  );
