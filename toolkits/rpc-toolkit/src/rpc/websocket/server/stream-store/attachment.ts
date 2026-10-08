import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import type { HibernatingSocket } from '../durable-object-state.ts';
import type { StreamStore } from './stream-store.ts';

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
  state: Schema.optionalKey(Schema.Unknown),
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

/** The socket's attachment, or `None` when it is absent or cannot be decoded. */
export const decodeConnectionAttachment = (
  value: unknown,
): Option.Option<ConnectionAttachment> =>
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

const read = (socket: HibernatingSocket) =>
  decodeConnectionAttachment(socket.deserializeAttachment<unknown>());

/** Rewrites the attachment; a socket whose attachment is missing is left alone. */
const update = (
  socket: HibernatingSocket,
  f: (attachment: ConnectionAttachment) => ConnectionAttachment,
) =>
  Effect.sync(() => {
    const current = read(socket);
    if (Option.isSome(current)) socket.serializeAttachment(f(current.value));
  });

const store: StreamStore = {
  connect: (socket, clientId, connection) =>
    Effect.sync(() =>
      socket.serializeAttachment(
        new ConnectionAttachment({
          clientId,
          handlers: [],
          ...(connection === undefined ? {} : { connection }),
        }),
      ),
    ),
  load: (socket) =>
    Effect.sync(() =>
      Option.map(read(socket), (attachment) => ({
        clientId: attachment.clientId,
        connection: attachment.connection,
        streams: attachment.handlers.map((handler) => ({
          request: handler.request,
          checkpoint: Object.hasOwn(handler, 'state')
            ? Option.some(handler.state)
            : Option.none(),
        })),
      })),
    ),
  start: (socket, _clientId, request) =>
    update(socket, (attachment) =>
      Option.isSome(findHandler(attachment, request.id))
        ? attachment
        : putHandler(
            attachment,
            new PersistedHandler({
              request: {
                ...request,
                headers: request.headers.map(([k, v]) => [k, v]),
              },
            }),
          ),
    ),
  getCheckpoint: (socket, _clientId, requestId) =>
    Effect.sync(() =>
      read(socket).pipe(
        Option.flatMap((attachment) => findHandler(attachment, requestId)),
        Option.flatMap((handler) =>
          Object.hasOwn(handler, 'state')
            ? Option.some(handler.state)
            : Option.none(),
        ),
      ),
    ),
  putCheckpoint: (socket, _clientId, requestId, state) =>
    update(socket, (attachment) =>
      Option.match(findHandler(attachment, requestId), {
        onNone: () => attachment,
        onSome: ({ request }) =>
          putHandler(attachment, new PersistedHandler({ request, state })),
      }),
    ),
  end: (socket, _clientId, requestId) =>
    update(socket, (attachment) => removeHandler(attachment, requestId)),
  // The attachment goes away with its socket.
  forget: () => Effect.void,
  reconcile: () => Effect.void,
};

/**
 * The default Stream Store: everything lives in the socket's attachment,
 * which Cloudflare caps at about 2 KB per socket.
 */
export const attachment = (): StreamStore => store;
