import type { RuntimeContext } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Scope } from 'effect';
import { HttpServerRequest } from 'effect/unstable/http';
import { RpcSerialization } from 'effect/unstable/rpc';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  makeHibernatingWebSocketRpc,
  type ConnectionSlot,
} from '@pkishorez/effect-cloudflare/hibernating-rpc';

export interface DurableRpcWorkerOptions<Rpcs extends Rpc.Any, A = never> {
  /** `import.meta.filename` of the module whose default export is this worker. */
  readonly main: string;
  readonly schema: RpcGroup.RpcGroup<Rpcs>;
  /** @default RpcSerialization.layerJson — must match the client's protocol. */
  readonly serialization?: Layer.Layer<RpcSerialization.RpcSerialization>;
  /** Name of the single Durable Object instance every request lands on. @default "singleton" */
  readonly instanceName?: string;
  /** Durable Object class name on the deployed script. @default `${id}Object` */
  readonly objectName?: string;
  /** Former host(s) of the Durable Object class, for data-preserving moves. */
  readonly transferredFrom?:
    | Cloudflare.DurableObjectTransferSource
    | Cloudflare.DurableObjectTransferSource[];
  /**
   * Runs in the Durable Object constructor — including at plan time, before
   * any instance exists — so `Config` reads here are discovered and bound
   * into the worker's env for the handlers to read at runtime.
   */
  readonly init?: Effect.Effect<unknown>;
  /** Per-connection value resolved from the upgrade request and provided to every handler. */
  readonly connection?: ConnectionSlot<A>;
  /** @default true — the worker's URL is how clients reach the RPC socket. */
  readonly workersDev?: boolean;
  readonly domain?: string;
  readonly dev?: { port: number };
  readonly compatibility?: { date?: string; flags?: string[] };
}

/**
 * The handler wiring for a {@link DurableRpcWorker}: runs once per Durable
 * Object activation, with the instance's state in context — yield
 * `Cloudflare.DurableObjectState` for storage (e.g. to mount SQLite).
 */
export type DurableRpcHandlers<Rpcs extends Rpc.Any, E = never> = Effect.Effect<
  Layer.Layer<
    Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.ServicesServer<Rpcs>,
    E,
    never
  >,
  never,
  RuntimeContext | Cloudflare.DurableObjectState | Scope.Scope
>;

/**
 * A worker with a Durable Object attached, speaking RPC over hibernating
 * WebSockets — the whole unit behind one URL.
 *
 * The worker is the door: every request is forwarded to a single Durable
 * Object instance, which serves the RPC group over WebSocket (with
 * hibernation, attachments, and stream checkpoints from
 * `@pkishorez/effect-cloudflare`). Clients connect straight to
 * `worker.url` — the local dev server under `alchemy dev`, the deployed
 * domain or workers.dev URL otherwise — so there is no cross-worker
 * binding and no dev/prod split.
 *
 * ```ts
 * export default class BankDo extends DurableRpcWorker<BankDo>()(
 *   'BankDo',
 *   { main: import.meta.filename, schema: BankRpcs },
 *   BankDurableObjectHandlers,
 * ) {}
 * ```
 */
export const DurableRpcWorker =
  <Self>() =>
  <Rpcs extends Rpc.Any, E = never, A = never>(
    id: string,
    options: DurableRpcWorkerOptions<Rpcs, A>,
    handlers: DurableRpcHandlers<Rpcs, E>,
  ) => {
    class DurableRpcObject extends Cloudflare.DurableObject<
      DurableRpcObject,
      Cloudflare.DurableObjectShape
    >()(options.objectName ?? `${id}Object`, {
      transferredFrom: options.transferredFrom,
    }) {}

    const objectLive = DurableRpcObject.make<never>(
      Effect.gen(function* () {
        const state = yield* Cloudflare.DurableObjectState;
        yield* options.init ?? Effect.void;

        return Effect.gen(function* () {
          const layer = yield* handlers;
          const rpc = yield* makeHibernatingWebSocketRpc({
            state,
            upgrade: Cloudflare.upgrade,
            group: options.schema,
            layer,
            connection: options.connection,
          }).pipe(
            Effect.provide(options.serialization ?? RpcSerialization.layerJson),
            Effect.orDie,
          );

          return {
            fetch: rpc.accept,
            webSocketMessage: rpc.message,
            webSocketClose: rpc.close,
          };
        });
      }),
    );

    return Cloudflare.Worker<Self>()(
      id,
      {
        main: options.main,
        workersDev: options.workersDev ?? true,
        ...(options.domain !== undefined && { domain: options.domain }),
        ...(options.dev !== undefined && { dev: options.dev }),
        ...(options.compatibility !== undefined && {
          compatibility: options.compatibility,
        }),
      },
      Effect.gen(function* () {
        const objects = yield* DurableRpcObject;
        return {
          fetch: Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;
            return yield* objects
              .getByName(options.instanceName ?? 'singleton')
              .fetch(request);
          }),
        };
      }).pipe(Effect.provide(objectLive)),
    );
  };
