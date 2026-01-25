import { WebSocket } from "@cloudflare/workers-types";
import { Schema } from "effect";

class TypedWebSocket<S extends Schema.Schema<any, any, never>> {
  private constructor(private schema: S) {}
  static make<S extends Schema.Schema<any, any, never>>(schema: S) {
    return new TypedWebSocket(schema);
  }

  get(webSocket: WebSocket): Schema.Schema.Type<S> {
    return Schema.decodeUnknownSync(this.schema)(
      webSocket.deserializeAttachment(),
    );
  }
  update(
    webSocket: WebSocket,
    fn: (meta: Schema.Schema.Type<S>) => Schema.Schema.Type<S>,
  ) {
    webSocket.serializeAttachment(
      Schema.encodeUnknownSync(this.schema)(fn(this.get(webSocket))),
    );
  }
  set(webSocket: WebSocket, meta: Schema.Schema.Type<S>) {
    webSocket.serializeAttachment(Schema.encodeUnknownSync(this.schema)(meta));
  }
}

export const typedWebSocket = TypedWebSocket.make(
  Schema.Struct({
    subscriptionEntities: Schema.Set(Schema.String),
    clientId: Schema.Number,
  }),
);
