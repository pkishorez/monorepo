import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { Headers } from 'effect/http';
import { RpcClient, RpcServer } from 'effect/rpc';
import type * as Rpc from 'effect/rpc/Rpc';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import * as RpcMessage from 'effect/rpc/RpcMessage';
import type * as RpcSerialization from 'effect/rpc/RpcSerialization';

/**
 * Values cross the connection as they are. Each side still checks them
 * against the type side of the schema, so a handler that returns the wrong
 * shape fails here as it would over a wire.
 */
const codecFor = Schema.toType as unknown as RpcSerialization.CodecFor;

/**
 * Provides an `RpcClient.Protocol` that serves `group` from its handlers in
 * this process: no transport, no serialization.
 *
 * This is the path `RpcTest.makeClient` takes, exposed as a Protocol so that
 * ordinary client code (`RpcClient.make(group)`) runs unchanged. Headers,
 * client middleware, and server middleware apply exactly as over HTTP.
 */
export const layerInProcessProtocol = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
): Layer.Layer<
  RpcClient.Protocol,
  never,
  Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs>
> =>
  Layer.effect(
    RpcClient.Protocol,
    RpcClient.Protocol.make(
      Effect.fnUntraced(function* (writeResponse) {
        const server = yield* RpcServer.makeNoSerialization(group, {
          onFromServer: (response) => {
            switch (response._tag) {
              case 'Chunk':
                return writeResponse(response.clientId, {
                  _tag: 'Chunk',
                  requestId: response.requestId,
                  values: response.values,
                });
              case 'Exit':
                return writeResponse(response.clientId, {
                  _tag: 'Exit',
                  requestId: response.requestId,
                  // The codec is the type side, so the client reads the Exit as is.
                  exit: response.exit as never,
                });
              case 'Defect':
                return writeResponse(response.clientId, {
                  _tag: 'Defect',
                  defect: response.defect,
                });
              case 'ClientEnd':
                return Effect.void;
            }
          },
        });

        const send = (
          clientId: number,
          message: RpcMessage.FromClientEncoded,
        ): Effect.Effect<void> => {
          switch (message._tag) {
            case 'Request':
              return server.write(clientId, {
                ...message,
                id: RpcMessage.RequestId(message.id),
                headers: Headers.fromInput(message.headers),
              } as RpcMessage.FromClient<Rpcs>);
            case 'Ack':
              return server.write(clientId, {
                _tag: 'Ack',
                requestId: RpcMessage.RequestId(message.requestId),
              });
            case 'Interrupt':
              return server.write(clientId, {
                _tag: 'Interrupt',
                requestId: RpcMessage.RequestId(message.requestId),
                interruptors: [],
              });
            case 'Eof':
              return server.write(clientId, message);
            case 'Ping':
              return Effect.void;
          }
        };

        return {
          send,
          supportsAck: true,
          supportsTransferables: false,
          codecFor,
        };
      }),
    ),
  );
