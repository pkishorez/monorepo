import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Rpc from 'effect/unstable/rpc/Rpc';
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';
import type { WorkerError } from 'effect/unstable/workers/WorkerError';
import { WorkerRunnerPlatform } from 'effect/unstable/workers/WorkerRunner';
import { WorkerHost } from '../../shared/worker-host/index.js';
import { makeRunnerPlatform } from './runner-platform.js';

declare const self: ServiceWorkerGlobalScope;

const platform = Layer.effect(WorkerRunnerPlatform)(
  Effect.map(Effect.service(WorkerHost), (host) =>
    makeRunnerPlatform(host, self.clients),
  ),
);

/**
 * The Worker Server: Effect RPC served inside the service worker over
 * `WorkerHost.messages`. Provide the group's handlers, then pass the result
 * to `runServiceWorker({ layer })`.
 *
 * Stateless: the browser may stop the worker at any time, and the next
 * message starts a fresh Worker Server. Tab Clients it no longer knows
 * reconnect, and their streams resume through Subscription Restart. A tab
 * whose Build ID differs gets `VersionSkew` instead of a connection.
 */
export const WorkerServer = {
  layer: <Rpcs extends Rpc.Any>(
    group: RpcGroup.RpcGroup<Rpcs>,
  ): Layer.Layer<
    never,
    WorkerError,
    | WorkerHost
    | Rpc.ToHandler<Rpcs>
    | Rpc.Middleware<Rpcs>
    | Rpc.ServicesServer<Rpcs>
  > =>
    RpcServer.layer(group).pipe(
      Layer.provide(RpcServer.layerProtocolWorkerRunner),
      Layer.provide(platform),
    ),
};
