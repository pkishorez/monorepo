import { Effect, FiberSet, Layer, Queue } from 'effect';
import { unixPathAddress } from 'effect/net/NetAddress';
import { RpcSerialization, RpcServer } from 'effect/rpc';
import * as Socket from 'effect/socket/Socket';
import { SocketServer } from 'effect/socket/SocketServer';
import { CodeApi } from '../connection/plugins/code/api/index.js';
import {
  Engine,
  storeOver,
  type StoreTable,
} from '../connection/plugins/code/engine/index.js';
import { CodeApiLive } from '../connection/plugins/code/serve/handlers/index.js';
import type { ComputerEdges } from './computers/index.js';
import { End } from './sockets.js';

/*
 * One computer's code Plugin in a tab: the real Engine over the computer's
 * edges and a Store on its own table, and the real handlers, served as the
 * Plugin serves them on its socket, Effect RPC's websocket protocol in
 * JSON, to every socket its tunnel passes on. When the Scope closes, the
 * engine stops every Turn, and every socket drops, as when the computer
 * goes away.
 */

/** Where the code Plugin keeps what a Session is sent that is not an image, on the computer's File System. */
const ATTACHMENTS = '/var/kestack/connect/attachments';

/** Where it makes new Worktrees, on the computer's File System. */
const WORKTREES = '/var/kestack/worktrees';

/** Every socket passed to the server, as a server's sockets are accepted. */
const acceptedFrom = (
  accepted: Queue.Dequeue<Socket.Socket>,
): SocketServer['Service'] => ({
  address: unixPathAddress('/code/rpc'),
  run: (handler) =>
    Effect.scoped(
      Effect.flatMap(FiberSet.make(), (each) =>
        Effect.forever(
          Effect.flatMap(Queue.take(accepted), (socket) =>
            FiberSet.run(each, handler(socket)),
          ),
        ),
      ),
    ),
});

/** The code Plugin over `edges` and the Store on `table`, for as long as the Scope: `pass` gives it a socket's server end. */
export const codePlugin = (
  edges: Layer.Layer<ComputerEdges>,
  table: StoreTable,
) =>
  Effect.gen(function* () {
    const accepted = yield* Queue.unbounded<Socket.Socket>();
    const base = Layer.merge(storeOver(table), edges);
    const engine = Engine.layer({
      attachments: ATTACHMENTS,
      worktrees: WORKTREES,
    }).pipe(Layer.provide(base));
    yield* Layer.build(
      RpcServer.layer(CodeApi).pipe(
        Layer.provide(RpcServer.layerProtocolSocketServer),
        Layer.provide(Layer.succeed(SocketServer, acceptedFrom(accepted))),
        Layer.provide(RpcSerialization.layerJson),
        Layer.provide(
          CodeApiLive.pipe(Layer.provide(Layer.merge(base, engine))),
        ),
      ),
    );
    return {
      /** Serves a socket by its server end, which drops once the socket is done with or the Plugin stops. */
      pass: (end: End) =>
        Effect.flatMap(
          Socket.fromWebSocket(
            Effect.acquireRelease(Effect.succeed(end), (open) =>
              Effect.sync(() => End.drop(open)),
            ),
          ),
          (socket) => Queue.offer(accepted, socket),
        ),
    };
  });
