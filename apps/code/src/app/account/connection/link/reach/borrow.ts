import { Context, Effect, Layer, Stream } from 'effect';
import { RpcSchema } from 'effect/rpc';
import { CodeApi, CodeClient, CodeClients } from '@kestack/connect/code';
import {
  connection as RpcConnection,
  status,
  type ConnectionStatus,
} from '@kestack/rpc-toolkit/rpc/websocket';
import { Connections } from '../../../account.ts';

/*
 * One Connection's API and socket for a page, borrowed call by call from
 * its Connection while it runs, so the page holds no socket of its own: a
 * call or a stream waits until the Connection runs, then goes over its
 * socket; the socket's status is `connecting` while it does not.
 */

type Api = CodeClient['Service'];
type Call = (...args: ReadonlyArray<unknown>) => unknown;

/** Each call of the API, as `CodeApi` names it, borrowed through `clients`. */
const apiOf = (connectionId: string, clients: CodeClients['Service']): Api =>
  Object.fromEntries(
    [...CodeApi.requests].map(([tag, rpc]) => {
      const call = (api: Api, args: ReadonlyArray<unknown>) =>
        (api as unknown as Record<string, Call>)[tag]!(...args);
      return [
        tag,
        RpcSchema.isStreamSchema(rpc.successSchema)
          ? (...args: ReadonlyArray<unknown>) =>
              CodeClients.stream(
                connectionId,
                Stream.unwrap(
                  Effect.map(
                    CodeClient,
                    (api) => call(api, args) as Stream.Stream<unknown>,
                  ),
                ),
              ).pipe(Stream.provideService(CodeClients, clients))
          : (...args: ReadonlyArray<unknown>) =>
              CodeClients.on(
                connectionId,
                Effect.flatMap(
                  CodeClient,
                  (api) => call(api, args) as Effect.Effect<unknown>,
                ),
              ).pipe(Effect.provideService(CodeClients, clients)),
      ];
    }),
  ) as unknown as Api;

/** One Connection's API and socket, borrowed from its Connection while it runs, for everything under a Layer. */
export const borrowed = (
  connectionId: string,
): Layer.Layer<CodeClient | RpcConnection, never, CodeClients | Connections> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const clients = yield* CodeClients;
      const connections = yield* Connections;
      const connectionStatus: Stream.Stream<ConnectionStatus> = connections
        .clients(connectionId)
        .pipe(
          Stream.switchMap((running) =>
            running === null
              ? Stream.make('connecting' as ConnectionStatus)
              : CodeClients.stream(connectionId, status).pipe(
                  Stream.provideService(CodeClients, running),
                ),
          ),
          Stream.changes,
        );
      return Context.make(CodeClient, apiOf(connectionId, clients)).pipe(
        Context.add(RpcConnection, {
          connectionStatus,
          keepSubscribed: (subscribe) =>
            CodeClients.stream(
              connectionId,
              Stream.unwrap(
                Effect.map(RpcConnection, (rpc) =>
                  rpc.keepSubscribed(subscribe),
                ),
              ),
            ).pipe(Stream.provideService(CodeClients, clients)) as never,
          hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
        }),
      );
    }),
  );
