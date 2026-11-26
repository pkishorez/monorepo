import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { Cause, Context, Duration, Effect, Exit, Fiber, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import {
  type Rpc,
  type RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/rpc';
import { NodeHttpServer } from '@effect/platform-node';
import {
  PluginEnv,
  type PluginFolders as Folders,
  READY,
  RPC_PATH,
} from '../http/plugin/contract/index.js';

export class PluginFolders extends Context.Service<PluginFolders, Folders>()(
  '@kestack/connect-v2/PluginFolders',
) {}

export interface PluginOptions<Rpcs extends Rpc.Any, E> {
  readonly name: string;
  readonly group: RpcGroup.RpcGroup<Rpcs>;
  readonly layer: Layer.Layer<Rpc.ToHandler<Rpcs>, E, PluginFolders>;
}

export class NotStartedByConnect extends Error {
  constructor(variable: string) {
    super(
      `${variable} is not set: a Plugin is started by ke-connect, which sets it`,
    );
  }
}

const fromEnv = (variable: string) => {
  const value = process.env[variable];
  if (!value) throw new NotStartedByConnect(variable);
  return value;
};

const isPipe = (socket: string) => socket.startsWith('\\\\.\\pipe\\');

export const routes = <Rpcs extends Rpc.Any, E>(
  group: RpcGroup.RpcGroup<Rpcs>,
  handlers: Layer.Layer<Rpc.ToHandler<Rpcs>, E>,
) =>
  Layer.mergeAll(
    RpcServer.layerHttp({ group, path: RPC_PATH, protocol: 'websocket' }).pipe(
      Layer.provide(RpcSerialization.layerJson),
    ),
    RpcServer.layerHttp({ group, path: RPC_PATH, protocol: 'http' }).pipe(
      Layer.provide(RpcSerialization.layerNdjson),
    ),
  ).pipe(Layer.provide(handlers));

export const listen = <Rpcs extends Rpc.Any, E>(
  options: PluginOptions<Rpcs, E>,
  socket: string,
  folders: Folders,
) =>
  Effect.gen(function* () {
    if (!isPipe(socket)) {
      mkdirSync(dirname(socket), { recursive: true, mode: 0o700 });
      rmSync(socket, { force: true });
    }
    const handlers = options.layer.pipe(
      Layer.provide(Layer.succeed(PluginFolders, folders)),
    );
    yield* Layer.build(
      HttpRouter.serve(
        routes(options.group, handlers) as Layer.Layer<never, E>,
      ).pipe(
        Layer.provide(
          NodeHttpServer.layer(createServer, {
            path: socket,
            gracefulShutdownTimeout: Duration.seconds(1),
          }),
        ),
      ),
    );
  });

export const serve = <Rpcs extends Rpc.Any, E>(
  options: PluginOptions<Rpcs, E>,
): void => {
  const program = Effect.suspend(() =>
    listen(options, fromEnv(PluginEnv.socket), {
      data: fromEnv(PluginEnv.data),
      state: fromEnv(PluginEnv.state),
      cache: fromEnv(PluginEnv.cache),
    }),
  ).pipe(
    Effect.andThen(Effect.sync(() => process.send?.(READY))),
    Effect.andThen(Effect.never),
    Effect.scoped,
  );
  const fiber = Effect.runFork(program);
  const stop = () => {
    Effect.runFork(Fiber.interrupt(fiber));
  };
  process.once('SIGTERM', stop);
  process.once('disconnect', stop);
  fiber.addObserver((exit) => {
    const failed = Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause);
    if (failed)
      console.error(`Plugin ${options.name} failed:`, Cause.pretty(exit.cause));
    process.exit(failed ? 1 : 0);
  });
};
