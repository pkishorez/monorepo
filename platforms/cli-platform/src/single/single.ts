import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Data, Effect, Layer, type Scope } from 'effect';
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
import { clientAt, probe } from './socket.js';

/*
 * One process per name. The process that listens on the name's socket is
 * the one, and serves its RPC group there; the kernel frees the socket when
 * that process exits, however it exits. A second process finds it listening
 * and gets a client to it instead, to ask it what it is doing. A crash
 * leaves the socket's file behind with no one listening: the next process
 * deletes it and takes the name.
 */

/** A client to the process that holds a name. */
export type Client<Rpcs extends Rpc.Any> = RpcClient.RpcClient<
  Rpcs,
  RpcClientError.RpcClientError
>;

/** This process holds the name, and serves its group, for the Scope. */
export interface Acquired {
  readonly _tag: 'Acquired';
}

/** Another process holds the name: a client to it, for the Scope. */
export interface AlreadyRunning<Rpcs extends Rpc.Any> {
  readonly _tag: 'AlreadyRunning';
  readonly client: Client<Rpcs>;
}

/** No process holds the name. */
export class NotRunning extends Data.TaggedError('NotRunning')<{
  readonly path: string;
}> {}

/** The socket could not be listened on, nor reached. */
export class SingleError extends Data.TaggedError('SingleError')<{
  readonly path: string;
  readonly message: string;
}> {}

const isPipe = (path: string) => path.startsWith('\\\\.\\pipe\\');

const codeOf = (error: SocketServer.SocketServerError) => {
  const cause = error.reason.cause as NodeJS.ErrnoException | undefined;
  return cause?.code;
};

/**
 * Takes the name whose socket is `path`, serving `group` with `handlers`
 * there for the Scope: Acquired, or AlreadyRunning with a client to the
 * process that holds it.
 */
export const single = <Rpcs extends Rpc.Any, E>(
  path: string,
  options: {
    readonly group: RpcGroup.RpcGroup<Rpcs>;
    readonly handlers: Layer.Layer<Rpc.ToHandler<Rpcs>, E>;
  },
): Effect.Effect<
  Acquired | AlreadyRunning<Rpcs>,
  E | SingleError,
  Scope.Scope
> => {
  const claim = (
    retried: boolean,
  ): Effect.Effect<
    Acquired | AlreadyRunning<Rpcs>,
    E | SingleError,
    Scope.Scope
  > =>
    NodeSocketServer.make({ path }).pipe(
      Effect.matchEffect({
        onSuccess: (server) =>
          Layer.build(
            // A group with RPC middleware gets it from `handlers`; what is
            // left for a generic group is unknown to the type, not to Effect.
            RpcServer.layer(options.group).pipe(
              Layer.provide(RpcServer.layerProtocolSocketServer),
              Layer.provide(Layer.succeed(SocketServer.SocketServer, server)),
              Layer.provide(RpcSerialization.layerNdjson),
              Layer.provide(options.handlers),
            ) as Layer.Layer<never, E>,
          ).pipe(Effect.as({ _tag: 'Acquired' } as const)),
        onFailure: (error) =>
          Effect.gen(function* () {
            if (codeOf(error) !== 'EADDRINUSE')
              return yield* new SingleError({ path, message: error.message });
            const found = yield* probe(path);
            if (found === 'listening')
              return {
                _tag: 'AlreadyRunning',
                client: yield* reachable(path, options.group),
              } as const;
            if (retried || isPipe(path))
              return yield* new SingleError({
                path,
                message: `${path} is in use, but nothing answers on it`,
              });
            // Left by a process that died: take it over, once.
            rmSync(path, { force: true });
            return yield* claim(true);
          }),
      }),
    );
  return Effect.suspend(() => {
    if (!isPipe(path))
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    return claim(false);
  });
};

/** A client to the process that holds the name whose socket is `path`, for the Scope; NotRunning when none does. */
export const reach = <Rpcs extends Rpc.Any>(
  path: string,
  group: RpcGroup.RpcGroup<Rpcs>,
) =>
  Effect.gen(function* () {
    if ((yield* probe(path)) !== 'listening')
      return yield* new NotRunning({ path });
    return yield* reachable(path, group);
  });

const reachable = <Rpcs extends Rpc.Any>(
  path: string,
  group: RpcGroup.RpcGroup<Rpcs>,
) =>
  clientAt(path, group).pipe(
    Effect.mapError(
      (error) => new SingleError({ path, message: error.message }),
    ),
  );
