import { connect } from 'node:net';
import { Effect, Layer } from 'effect';
import {
  type Rpc,
  RpcClient,
  type RpcGroup,
  RpcSerialization,
} from 'effect/rpc';
import { NodeSocket } from '@effect/platform-node';

export type Found = 'listening' | 'stale' | 'missing';

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
