import { connect } from 'node:net';
import { Effect, Layer } from 'effect';
import {
  type Rpc,
  RpcClient,
  type RpcGroup,
  RpcSerialization,
} from 'effect/rpc';
import { NodeSocket } from '@effect/platform-node';

/*
 * The client side of a socket: whether something listens on it, and an RPC
 * client to what does. Effect RPC's socket protocol frames each message as
 * a line of JSON.
 */

/** What is at a socket path: a listener, a file no one listens on, or nothing. */
export type Found = 'listening' | 'stale' | 'missing';

/** Connects to `path` once and closes at once, to see what is there. */
export const probe = (path: string) =>
  Effect.callback<Found>((resume) => {
    const socket = connect({ path });
    socket.once('connect', () => {
      socket.destroy();
      resume(Effect.succeed('listening'));
    });
    socket.once('error', (error: NodeJS.ErrnoException) =>
      resume(Effect.succeed(error.code === 'ENOENT' ? 'missing' : 'stale')),
    );
  });

/** An RPC client to the server of `group` listening on `path`, for the Scope. */
export const clientAt = <Rpcs extends Rpc.Any>(
  path: string,
  group: RpcGroup.RpcGroup<Rpcs>,
) =>
  Effect.gen(function* () {
    const protocol = yield* Layer.build(
      RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
        Layer.provide(NodeSocket.layerNet({ path })),
        Layer.provide(RpcSerialization.layerNdjson),
      ),
    );
    return yield* RpcClient.make(group).pipe(Effect.provide(protocol));
  });
