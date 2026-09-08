import type * as cf from '@cloudflare/workers-types';
import { DurableObject } from 'cloudflare:workers';
import type { WorkerEnv } from '../../../infra/website.ts';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { RpcSerialization } from 'effect/unstable/rpc';
import {
  fromDurableObjectState,
  makeHibernatingWebSocketRpc,
  type HibernatingSocket,
} from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';
import { Greeting } from '../../shared/rpc/greeting/index.ts';
import { GreetingHandlers } from '../../shared/rpc/greeting-handlers/index.ts';

interface Rpc {
  readonly accept: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest
  >;
  readonly message: (
    socket: HibernatingSocket,
    data: string | ArrayBuffer,
  ) => Effect.Effect<void>;
  readonly close: (
    socket: HibernatingSocket,
    code: number,
    reason: string,
  ) => Effect.Effect<void>;
}

/**
 * The Durable Object serving the RPC groups over hibernating WebSockets.
 * Hosted by the Website Worker: `src/server.ts` exports this class and
 * forwards `/ws/__NAME__` upgrades to a single instance.
 */
export class __Name__Object extends DurableObject<WorkerEnv> {
  readonly #rpc: Promise<Rpc>;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.#rpc = ctx.blockConcurrencyWhile(() => this.#boot());
  }

  #boot(): Promise<Rpc> {
    const { state, upgrade } = fromDurableObjectState(
      this.ctx as unknown as cf.DurableObjectState,
    );

    return ManagedRuntime.make(Layer.empty).runPromise(
      Effect.gen(function* () {
        return yield* makeHibernatingWebSocketRpc({
          state,
          upgrade,
          group: Greeting,
          layer: GreetingHandlers,
        }).pipe(Effect.provide(RpcSerialization.layerJson), Effect.orDie);
      }),
    );
  }

  override async fetch(request: Request): Promise<Response> {
    const rpc = await this.#rpc;
    const response = await Effect.runPromise(
      rpc.accept.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(request),
        ),
      ),
    );
    return HttpServerResponse.toWeb(response);
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const rpc = await this.#rpc;
    await Effect.runPromise(rpc.message(socketOf(ws), message));
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    const rpc = await this.#rpc;
    await Effect.runPromise(rpc.close(socketOf(ws), code, reason));
  }
}

// The DOM lib types `WebSocket`; the toolkit expects the Workers one.
const socketOf = (socket: WebSocket): HibernatingSocket => {
  const ws = socket as unknown as cf.WebSocket;
  return {
    ws,
    close: (code, reason) => Effect.sync(() => ws.close(code, reason)),
    serializeAttachment: (value) => ws.serializeAttachment(value),
    deserializeAttachment: <T>() => ws.deserializeAttachment() as T | null,
  };
};
