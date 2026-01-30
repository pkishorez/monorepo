import { Context, Effect, Layer } from "effect";
import { BroadcastSchema, EntityType } from "../schema";
import { RpcSerialization } from "@effect/rpc";
import { typedWebSocket } from "./typed";
import { DurableObjectState, WebSocket } from "@cloudflare/workers-types";

export class ConnectionService extends Context.Tag("ConnectionService")<
  ConnectionService,
  {
    emit: (value: EntityType<any>[]) => void;
    broadcast: (value: EntityType<any>) => void;
    subscribe: (entity: string) => void;
    unsubscribe: (entity: string) => void;
  }
>() {
  static make(state: DurableObjectState<any>, websocket: WebSocket) {
    return Layer.effect(
      ConnectionService,
      Effect.gen(function* () {
        const serialization = yield* RpcSerialization.RpcSerialization;
        const parser = serialization.unsafeMake();

        return {
          emit(values: EntityType<any>[]) {
            const encoded = parser.encode(
              BroadcastSchema.make({
                _tag: "@std-toolkit/broadcast",
                values,
              }),
            );

            if (encoded) {
              websocket.send(encoded);
            }
          },

          broadcast(value) {
            const websockets = state.getWebSockets();
            const encoded = parser.encode(
              BroadcastSchema.make({
                values: [value],
                _tag: "@std-toolkit/broadcast",
              }),
            );

            if (encoded) {
              websockets.forEach((ws) => {
                const subscribedEntities =
                  typedWebSocket.get(ws).subscriptionEntities;
                if (subscribedEntities.has(value.meta._e)) {
                  ws.send(encoded);
                }
              });
            }
          },
          subscribe(entity) {
            typedWebSocket.update(websocket, (meta) => ({
              ...meta,
              subscriptionEntities: meta.subscriptionEntities.add(entity),
            }));
          },
          unsubscribe(entity) {
            const meta = typedWebSocket.get(websocket);
            meta.subscriptionEntities.delete(entity);
            typedWebSocket.set(websocket, meta);
          },
        };
      }),
    );
  }
}
