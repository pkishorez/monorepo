import type { RuntimeContext } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect, Layer, Scope } from 'effect';
import { HttpServerRequest } from 'effect/http';
import type { Rpc as EffectRpc, RpcGroup } from 'effect/rpc';
import { Rpc } from '../rpc/index.ts';

/** Effect RPC over an Alchemy Worker service binding: Alchemy's `Cloudflare.RpcWorker`. */
export const RpcWorker = Cloudflare.RpcWorker;

export interface DurableRpcWorkerOptions<
  Rpcs extends EffectRpc.Any,
  A = never,
> {
  /** `import.meta.filename` of the module whose default export is this worker. */
  readonly main: string;
  readonly schema: RpcGroup.RpcGroup<Rpcs>;
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
  readonly connection?:
    | Rpc.ConnectionSlot<A>
    | ((
        state: Cloudflare.DurableObjectState['Service'],
      ) => Rpc.ConnectionSlot<A>);
  /**
   * Where each socket's record and open streams are kept, e.g.
   * `(state) => Rpc.websocket.streams.sqlite({ storage: state.raw.storage })`.
   * @default the socket attachment (`Rpc.websocket.streams.attachment()`)
   */
  readonly streams?:
    | Rpc.StreamStore
    | ((state: Cloudflare.DurableObjectState['Service']) => Rpc.StreamStore);
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
export type DurableRpcHandlers<
  Rpcs extends EffectRpc.Any,
  E = never,
> = Effect.Effect<
  Layer.Layer<
    | EffectRpc.ToHandler<Rpcs>
    | EffectRpc.Middleware<Rpcs>
    | EffectRpc.ServicesServer<Rpcs>,
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
 * `Rpc.websocket.server`). Clients connect straight to
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
  <Rpcs extends EffectRpc.Any, E = never, A = never>(
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

    const objectLive = DurableRpcObject.make(
      Effect.gen(function* () {
        const state = yield* Cloudflare.DurableObjectState;
        yield* options.init ?? Effect.void;
        const connection =
          typeof options.connection === 'function'
            ? options.connection(state)
            : options.connection;
        const streams =
          typeof options.streams === 'function'
            ? options.streams(state)
            : options.streams;

        return Effect.gen(function* () {
          const layer = yield* handlers;
          const rpc = yield* Rpc.websocket.server(options.schema, layer, {
            state,
            upgrade: Cloudflare.upgrade,
            connection,
            streams,
          });

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
