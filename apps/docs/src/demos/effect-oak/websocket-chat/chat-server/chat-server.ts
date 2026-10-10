import { Context, Effect, Layer, Queue, Stream } from 'effect';

/*
 * The chat server: Postman's public echo socket, which needs no key and sends
 * every message straight back.
 *
 * `connect` opens a socket for as long as the Stream runs and says what
 * happens to it; run it as a Lifetime, and leaving the State closes the
 * socket. `send` writes to the socket that is open, if any. Like Foldkit's
 * ManagedResource, the open socket is kept here, not Provided by the State.
 */

const WS_URL = 'wss://ws.postman-echo.com/raw';
const CONNECTION_TIMEOUT_MS = 5000;

export type ServerEvent =
  | { readonly _tag: 'Opened' }
  | { readonly _tag: 'Received'; readonly text: string }
  | { readonly _tag: 'Closed' }
  | { readonly _tag: 'Failed'; readonly error: string };

export class ChatServer extends Context.Service<
  ChatServer,
  {
    readonly connect: Stream.Stream<ServerEvent>;
    readonly send: (text: string) => Effect.Effect<void, string>;
  }
>()('docs/websocket-chat/ChatServer') {}

export const ChatServerLive = Layer.sync(ChatServer, () => {
  let open: WebSocket | undefined;

  const connect = Stream.callback<ServerEvent>((queue) => {
    const last = (event: ServerEvent) => {
      Queue.offerUnsafe(queue, event);
      Queue.endUnsafe(queue);
    };
    return Effect.gen(function* () {
      const socket = yield* Effect.acquireRelease(
        Effect.sync(() => new WebSocket(WS_URL)),
        (socket) =>
          Effect.sync(() => {
            if (open === socket) open = undefined;
            socket.close();
          }),
      );
      socket.addEventListener('open', () => {
        open = socket;
        Queue.offerUnsafe(queue, { _tag: 'Opened' });
      });
      socket.addEventListener('message', (event) =>
        Queue.offerUnsafe(queue, {
          _tag: 'Received',
          text: String(event.data),
        }),
      );
      socket.addEventListener('close', () => last({ _tag: 'Closed' }));
      socket.addEventListener('error', () =>
        last({ _tag: 'Failed', error: 'Failed to connect to WebSocket' }),
      );
      // Sleeps in the app's Time, so a paused app does not time out.
      yield* Effect.forkScoped(
        Effect.sleep(CONNECTION_TIMEOUT_MS).pipe(
          Effect.andThen(
            Effect.sync(() => {
              if (socket.readyState === WebSocket.CONNECTING)
                last({ _tag: 'Failed', error: 'Connection timeout' });
            }),
          ),
        ),
      );
    });
  });

  const send = (text: string) =>
    Effect.suspend(() =>
      open?.readyState === WebSocket.OPEN
        ? Effect.try({
            try: () => open?.send(text),
            catch: () => 'Failed to send message',
          })
        : Effect.fail('Socket unavailable'),
    );

  return { connect, send };
});
