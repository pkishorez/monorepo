import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Data, Duration, Effect, Exit, Layer, Scope } from 'effect';
import {
  type Rpc,
  type RpcClient,
  type RpcClientError,
  type RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/rpc';
import { SocketServer } from 'effect/socket';
import { NodeSocketServer } from '@effect/platform-node';
import { Locks } from '../../locks/contract/index.js';
import { clientAt, probe } from './socket.js';

export type Client<Rpcs extends Rpc.Any> = RpcClient.RpcClient<
  Rpcs,
  RpcClientError.RpcClientError
>;

export class NotRunning extends Data.TaggedError('NotRunning')<{
  readonly path: string;
}> {}

export class SingleError extends Data.TaggedError('SingleError')<{
  readonly path: string;
  readonly message: string;
}> {}

const CLAIMING = Duration.seconds(10);

const isPipe = (path: string) => path.startsWith('\\\\.\\pipe\\');

const codeOf = (error: SocketServer.SocketServerError) =>
  (error.reason.cause as NodeJS.ErrnoException | undefined)?.code;

const reachable = <Rpcs extends Rpc.Any>(
  path: string,
  group: RpcGroup.RpcGroup<Rpcs>,
) =>
  clientAt(path, group).pipe(
    Effect.mapError(
      (error) => new SingleError({ path, message: error.message }),
    ),
  );

export const single = <Rpcs extends Rpc.Any, E>(
  path: string,
  options: {
    readonly group: RpcGroup.RpcGroup<Rpcs>;
    readonly handlers: Layer.Layer<Rpc.ToHandler<Rpcs>, E>;
  },
) => {
  const listen = (
    retried: boolean,
  ): Effect.Effect<
    SocketServer.SocketServer['Service'] | null,
    SingleError,
    Scope.Scope
  > =>
    NodeSocketServer.make({ path }).pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          if (codeOf(error) !== 'EADDRINUSE')
            return yield* new SingleError({ path, message: error.message });
          if ((yield* probe(path)) === 'listening') return null;
          if (retried || isPipe(path))
            return yield* new SingleError({
              path,
              message: `${path} is in use, but nothing answers on it`,
            });
          rmSync(path, { force: true });
          return yield* listen(true);
        }),
      ),
    );
  return Effect.gen(function* () {
    const locks = yield* Locks;
    if (!isPipe(path))
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const held = yield* Scope.make();
    const server = yield* Effect.gen(function* () {
      yield* locks.hold(path, CLAIMING).pipe(
        Scope.provide(held),
        Effect.mapError(
          (error) => new SingleError({ path, message: error.message }),
        ),
      );
      return yield* listen(false);
    }).pipe(Effect.ensuring(Scope.close(held, Exit.void)));
    if (server === null)
      return {
        _tag: 'AlreadyRunning',
        client: yield* reachable(path, options.group),
      } as const;
    yield* Layer.build(
      RpcServer.layer(options.group).pipe(
        Layer.provide(RpcServer.layerProtocolSocketServer),
        Layer.provide(Layer.succeed(SocketServer.SocketServer, server)),
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(options.handlers),
      ) as Layer.Layer<never, E>,
    );
    return { _tag: 'Acquired' } as const;
  });
};

export const reach = <Rpcs extends Rpc.Any>(
  path: string,
  group: RpcGroup.RpcGroup<Rpcs>,
) =>
  Effect.gen(function* () {
    if ((yield* probe(path)) !== 'listening')
      return yield* new NotRunning({ path });
    return yield* reachable(path, group);
  });
