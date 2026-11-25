import { Effect, Schedule, Schema } from 'effect';
import { Rpc, RpcClient, RpcGroup, RpcSerialization } from 'effect/rpc';
import type { RpcClientError } from 'effect/rpc';
import { Socket } from 'effect/socket';
import { KabukiSessionRpcs } from '../session/contract/index.ts';

export const CONNECT_PATH = '/kabuki/connect';

export const SESSIONS_PATH = '/kabuki/sessions';

export const SESSION_PATH = '/kabuki/session/:name';

export const sessionPath = (name: string) =>
  `/kabuki/session/${encodeURIComponent(name)}`;

export const serialization = RpcSerialization.layerJson;

export const TabRpcs = RpcGroup.make(
  Rpc.make('named', { payload: { name: Schema.String } }),
  Rpc.make('page', { success: Schema.String, stream: true }),
);

export const ServedRpcs = KabukiSessionRpcs.merge(TabRpcs);

export type TabClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof ServedRpcs>,
  RpcClientError.RpcClientError
>;

const socketUrl = (origin: string, path: string) => {
  const url = new URL(path, origin);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  return url.toString();
};

export const protocolTo = (origin: string, path: string) =>
  Effect.gen(function* () {
    const socket = yield* Socket.makeWebSocket(socketUrl(origin, path));
    return yield* RpcClient.makeProtocolSocket({
      retryTransientErrors: false,
      retryPolicy: Schedule.recurs(0),
    }).pipe(
      Effect.provideService(Socket.Socket, socket),
      Effect.provide(serialization),
    );
  }).pipe(Effect.provide(Socket.layerWebSocketConstructorGlobal));
