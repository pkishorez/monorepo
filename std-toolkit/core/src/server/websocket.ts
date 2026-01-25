import { Rpc, RpcGroup, RpcSerialization, RpcServer } from "@effect/rpc";
import { Deferred, Effect } from "effect";
import { typedWebSocket } from "./typed";
import { DurableObjectState, WebSocket } from "@cloudflare/workers-types";
import { ConnectionService } from "./connection";

export const handleMessage = <Rpcs extends Rpc.Any>(
  state: DurableObjectState<any>,
  ws: WebSocket,
  rpcs: RpcGroup.RpcGroup<Rpcs>,
  message: string,
) =>
  Effect.gen(function* () {
    const serialization = yield* RpcSerialization.RpcSerialization;
    const parser = serialization.unsafeMake();
    const decoded = parser.decode(message);
    const { clientId } = typedWebSocket.get(ws);

    const latch = yield* Deferred.make<void>();

    const rpcServer = yield* RpcServer.makeNoSerialization(rpcs, {
      disableClientAcks: true, // No ACKs needed - simpler for hibernation
      onFromServer: (response) =>
        Effect.gen(function* () {
          const encoded = parser.encode(response);
          if (encoded !== undefined) {
            ws.send(encoded);
          }
          const r = response as { _tag: string };
          if (r._tag === "Exit" || r._tag === "ClientEnd") {
            yield* Deferred.succeed(latch, undefined);
          }
        }),
    });

    for (const msg of decoded) {
      const m = msg as { _tag: string };
      if (m._tag === "Ping" || m._tag === "Pong") continue;
      yield* rpcServer.write(clientId, msg as any);
    }

    yield* Deferred.await(latch);
  }).pipe(Effect.provide(ConnectionService.make(state, ws)), Effect.scoped);
