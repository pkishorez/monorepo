import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

const HandlerRequest = Schema.Struct({
  _tag: Schema.Literal('Request'),
  id: Schema.Union([Schema.String, Schema.Number]),
  tag: Schema.String,
  payload: Schema.Unknown,
  headers: Schema.Array(
    Schema.mutable(Schema.Tuple([Schema.String, Schema.String])),
  ),
  traceId: Schema.optionalKey(Schema.String),
  spanId: Schema.optionalKey(Schema.String),
  sampled: Schema.optionalKey(Schema.Boolean),
});

export class PersistedHandler extends Schema.Class<PersistedHandler>(
  'PersistedHandler',
)({
  request: HandlerRequest,
  state: Schema.Unknown,
}) {}

/**
 * Everything that survives hibernation, per socket.
 *
 * `connection` holds the *encoded* connection value. The attachment schema
 * treats it as opaque — only the caller's schema (if any) knows its shape.
 */
export class ConnectionAttachment extends Schema.Class<ConnectionAttachment>(
  'ConnectionAttachment',
)({
  clientId: Schema.Number,
  handlers: Schema.Array(PersistedHandler),
  connection: Schema.optionalKey(Schema.Unknown),
}) {}

const decode = Schema.decodeUnknownOption(ConnectionAttachment);

export const decodeConnectionAttachment = (
  value: unknown,
  fallbackClientId: number,
): ConnectionAttachment =>
  decode(value).pipe(
    Option.map((attachment) =>
      // Back-compat: sockets that hibernated across the rename still carry the
      // connection value under `identity`. Safe to delete once every socket
      // predating the rename has closed.
      attachment.connection === undefined &&
      typeof value === 'object' &&
      value !== null &&
      'identity' in value
        ? new ConnectionAttachment({
            ...attachment,
            connection: (value as { identity: unknown }).identity,
          })
        : attachment,
    ),
    Option.getOrElse(
      () =>
        new ConnectionAttachment({
          clientId: fallbackClientId,
          handlers: [],
        }),
    ),
  );

export const findHandler = (
  attachment: ConnectionAttachment,
  requestId: string | number,
) =>
  Option.fromNullishOr(
    attachment.handlers.find(({ request }) => request.id === requestId),
  );

export const putHandler = (
  attachment: ConnectionAttachment,
  handler: PersistedHandler,
): ConnectionAttachment =>
  new ConnectionAttachment({
    ...attachment,
    handlers: [
      ...attachment.handlers.filter(
        ({ request }) => request.id !== handler.request.id,
      ),
      handler,
    ],
  });

export const removeHandler = (
  attachment: ConnectionAttachment,
  requestId: string | number,
): ConnectionAttachment =>
  new ConnectionAttachment({
    ...attachment,
    handlers: attachment.handlers.filter(
      ({ request }) => request.id !== requestId,
    ),
  });
