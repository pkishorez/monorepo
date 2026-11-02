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
import {
  type Etag,
  HttpMiddleware,
  type HttpPlatform,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import {
  type Rpc,
  type RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/rpc';
import { NodeHttpServer, type NodeServices } from '@effect/platform-node';
import {
  PluginControl,
  PluginEnv,
  PluginPaths,
  READY,
} from '../contract/index.js';
import { pluginShared } from '../../files/index.js';
import { areaOf } from './access.js';

/*
 * A Plugin's side: the `main` its one file runs. It reads where to listen
 * and its folders from the environment its CLI started it with, and serves
 * on that socket one HTTP server: its own RPC group at `/rpc` and
 * PluginControl at `/control`, over WebSocket, any routes of its own
 * beside them, and the routes of its Public Area under `/public`. The CLI
 * guards who reaches it, and says on each request whether the caller holds
 * its key; `access.ts` keeps all but the Public Area from one that does
 * not, and all of it from one not marked when the CLI says it marks every
 * one. Its handlers and routes share one build of its Layer. Once it
 * listens it tells the CLI over Node IPC. SIGTERM, or its CLI going away,
 * closes it: its finalizers run and it exits 0.
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

/** What a Plugin's routes may use beside its Layer: its folders and Node's HTTP platform. */
export type RouteServices =
  | PluginFolders
  | HttpPlatform.HttpPlatform
  | Etag.Generator
  | NodeServices.NodeServices;

/**
 * What a Plugin is: its name, the group it serves, the Layer of its
 * handlers and of whatever its routes share with them, and its routes.
 */
export interface PluginOptions<Rpcs extends Rpc.Any, E, Shared = never> {
  readonly name: string;
  readonly group: RpcGroup.RpcGroup<Rpcs>;
  readonly layer: Layer.Layer<Rpc.ToHandler<Rpcs> | Shared, E, PluginFolders>;
  /** Routes beside `/rpc`, for a caller with the key alone. */
  readonly routes?: ReadonlyArray<
    HttpRouter.Route<unknown, Shared | RouteServices>
  >;
  /** The Public Area's routes, for anyone: a route at `/a` answers at `/public/a`. */
  readonly publicRoutes?: ReadonlyArray<
    HttpRouter.Route<unknown, Shared | RouteServices>
  >;
}

const NOT_FOUND = HttpServerResponse.empty({ status: 404 });

/**
 * The routes in `layer` as one handler. Their services are left for the
 * server to provide: the types of HttpRouter's request markers are not
 * followed through here.
 */
const handlerOf = (layer: Layer.Layer<never, unknown, unknown>) =>
  HttpRouter.toHttpEffect(layer as Layer.Layer<never>) as Effect.Effect<
    Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      unknown,
      HttpServerRequest.HttpServerRequest | Scope.Scope
    >,
    unknown,
    Scope.Scope
  >;

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
const serve = <Rpcs extends Rpc.Any, E, Shared>(
  options: PluginOptions<Rpcs, E, Shared>,
  socket: string,
  folders: PluginFolders['Service'],
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const startedAt = Date.now();
    const services = yield* Layer.build(
      options.layer.pipe(
        Layer.provideMerge(Layer.succeed(PluginFolders, folders)),
      ),
    );
    const control = PluginControl.toLayer({
      status: () =>
        Effect.succeed({ name: options.name, pid: process.pid, startedAt }),
      health: () => Effect.void,
    });
    const keyed = yield* handlerOf(
      Layer.mergeAll(
        RpcServer.layerHttp({
          group: options.group,
          path: PluginPaths.rpc,
          protocol: 'websocket',
        }),
        RpcServer.layerHttp({
          group: PluginControl,
          path: PluginPaths.control,
          protocol: 'websocket',
        }).pipe(Layer.provide(control)),
        HttpRouter.addAll(options.routes ?? []),
      ).pipe(
        Layer.provide(RpcSerialization.layerJson),
        Layer.provide(Layer.succeedContext(services)),
      ),
    );
    const open = yield* handlerOf(
      HttpRouter.addAll(options.publicRoutes ?? [], {
        prefix: PluginPaths.public,
      }),
    );
    const marked = Boolean(process.env[PluginEnv.access]);
    const app = Effect.flatMap(
      HttpServerRequest.HttpServerRequest,
      (request) => {
        const area = areaOf(request, marked);
        // A Public Area URL is its own credential, such as a File Ticket,
        // so it is never written to the log.
        return area === 'public'
          ? HttpMiddleware.withLoggerDisabled(open)
          : area === 'keyed'
            ? keyed
            : Effect.succeed(NOT_FOUND);
      },
    );
    // The CLI gives each Plugin its own socket, and starts one Plugin on it
    // at a time: a file there was left by one that died.
    if (!socket.startsWith('\\\\.\\pipe\\')) {
      mkdirSync(dirname(socket), { recursive: true, mode: 0o700 });
      rmSync(socket, { force: true });
    }
    yield* Layer.build(
      HttpServer.serve(app, HttpMiddleware.logger).pipe(
        HttpServer.withLogAddress,
        Layer.provide(Layer.succeedContext(services)),
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
  <Rpcs extends Rpc.Any, E, Shared = never>(
    options: PluginOptions<Rpcs, E, Shared>,
  ) =>
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
