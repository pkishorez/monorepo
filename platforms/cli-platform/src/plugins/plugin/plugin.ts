import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import {
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  type Scope,
} from 'effect';
import { HttpRouter } from 'effect/http';
import {
  type Rpc,
  type RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/rpc';
import { NodeHttpServer } from '@effect/platform-node';
import {
  PluginControl,
  PluginEnv,
  PluginPaths,
  READY,
} from '../contract/index.js';
import { pluginShared } from '../../files/index.js';

/*
 * A Plugin's side: the `main` its one file runs. It reads where to listen
 * and its folders from the environment its CLI started it with, and serves
 * on that socket one HTTP server: its own RPC group at `/rpc` and
 * PluginControl at `/control`, over WebSocket. The CLI guards who reaches
 * it. Once it listens it tells the CLI over Node IPC. SIGTERM, or its CLI
 * going away, closes it: its finalizers run and it exits 0.
 */

/**
 * The folders a Plugin keeps its files in, which its CLI made for it;
 * `shared` is kept when its CLI's name is forgotten.
 */
export class PluginFolders extends Context.Service<
  PluginFolders,
  {
    readonly data: string;
    readonly state: string;
    readonly cache: string;
    readonly shared: string;
  }
>()('@kestack/cli-platform/PluginFolders') {}

/** What a Plugin is: its name, the group it serves, and the Layer of its handlers. */
export interface PluginOptions<Rpcs extends Rpc.Any, E> {
  readonly name: string;
  readonly group: RpcGroup.RpcGroup<Rpcs>;
  readonly layer: Layer.Layer<Rpc.ToHandler<Rpcs>, E, PluginFolders>;
}

const fromEnv = (variable: string) => {
  const value = process.env[variable];
  if (!value)
    throw new Error(
      `${variable} is not set: a Plugin is started by its CLI, which sets it`,
    );
  return value;
};

/**
 * The Plugin's shared folder. A CLI from before there was one does not
 * say where it is: then it is where that CLI's `pluginFolders` would put
 * it, found from the same environment, and made here.
 */
const sharedOf = (plugin: string) => {
  const given = process.env[PluginEnv.shared];
  if (given) return given;
  const shared = pluginShared({ plugin });
  mkdirSync(shared, { recursive: true, mode: 0o700 });
  return shared;
};

/** Serves the Plugin on `socket` for the Scope, and tells the CLI once it listens. */
const serve = <Rpcs extends Rpc.Any, E>(
  { name, group, layer }: PluginOptions<Rpcs, E>,
  socket: string,
  folders: PluginFolders['Service'],
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const startedAt = Date.now();
    const control = PluginControl.toLayer({
      status: () => Effect.succeed({ name, pid: process.pid, startedAt }),
      health: () => Effect.void,
    });
    const routes = Layer.mergeAll(
      RpcServer.layerHttp({
        group,
        path: PluginPaths.rpc,
        protocol: 'websocket',
      }).pipe(
        Layer.provide(layer),
        Layer.provide(Layer.succeed(PluginFolders, folders)),
      ),
      RpcServer.layerHttp({
        group: PluginControl,
        path: PluginPaths.control,
        protocol: 'websocket',
      }).pipe(Layer.provide(control)),
    ).pipe(Layer.provide(RpcSerialization.layerJson));
    // The CLI gives each Plugin its own socket, and starts one Plugin on it
    // at a time: a file there was left by one that died.
    if (!socket.startsWith('\\\\.\\pipe\\')) {
      mkdirSync(dirname(socket), { recursive: true, mode: 0o700 });
      rmSync(socket, { force: true });
    }
    yield* Layer.build(
      HttpRouter.serve(routes as Layer.Layer<never, E>).pipe(
        Layer.provide(
          NodeHttpServer.layer(createServer, {
            path: socket,
            gracefulShutdownTimeout: Duration.seconds(1),
          }),
        ),
      ),
    );
    process.send?.(READY);
  });

/**
 * The `main` a Plugin's file calls: serves the Plugin where its CLI said,
 * until SIGTERM or the CLI going away, then exits 0; exits 1 if it cannot.
 */
const make =
  <Rpcs extends Rpc.Any, E>(options: PluginOptions<Rpcs, E>) =>
  (): void => {
    const program = Effect.suspend(() =>
      serve(options, fromEnv(PluginEnv.socket), {
        data: fromEnv(PluginEnv.data),
        state: fromEnv(PluginEnv.state),
        cache: fromEnv(PluginEnv.cache),
        shared: sharedOf(options.name),
      }),
    ).pipe(Effect.andThen(Effect.never), Effect.scoped);
    const fiber = Effect.runFork(program);
    const stop = () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
    process.once('SIGTERM', stop);
    // The CLI's IPC channel closes when it exits, however it exits.
    process.once('disconnect', stop);
    fiber.addObserver((exit) => {
      const failed =
        Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause);
      if (failed)
        console.error(
          `Plugin ${options.name} failed:`,
          Cause.pretty(exit.cause),
        );
      process.exit(failed ? 1 : 0);
    });
  };

/** Makes the `main` of a Plugin. */
export const Plugin = { make };
