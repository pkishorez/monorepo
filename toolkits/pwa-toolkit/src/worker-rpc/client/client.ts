import type * as Context from 'effect/Context';
import * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import type * as Scope from 'effect/Scope';
import type * as Rpc from 'effect/unstable/rpc/Rpc';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import type { RpcClientError } from 'effect/unstable/rpc/RpcClientError';
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup';
import * as Worker from 'effect/unstable/workers/Worker';
import type { WorkerError } from 'effect/unstable/workers/WorkerError';
import type { VersionSkew } from '../handshake/index.js';
import { makeTabPlatform } from './platform.js';
import { serviceWorkerContainer, tabBuildId } from './tab-environment.js';
import { makeSkewState, withVersionSkew } from './version-skew.js';

export { VersionSkew } from '../handshake/index.js';

type Client<Rpcs extends Rpc.Any> = RpcClient.RpcClient<
  Rpcs,
  RpcClientError | VersionSkew
>;

interface Options {
  /**
   * While calls are in flight, how often the Tab Client checks that the
   * Worker Server still knows it; also how long it waits for the handshake.
   * Default 5 seconds.
   */
  readonly livenessInterval?: Duration.Input;
}

const make = <Rpcs extends Rpc.Any>(
  group: RpcGroup.RpcGroup<Rpcs>,
  options?: Options,
): Effect.Effect<
  Client<Rpcs>,
  WorkerError,
  Scope.Scope | Rpc.MiddlewareClient<Rpcs>
> =>
  Effect.gen(function* () {
    const buildId = yield* tabBuildId;
    const container = yield* serviceWorkerContainer;
    const skew = makeSkewState();
    const protocol = yield* RpcClient.makeProtocolWorker({ size: 1 }).pipe(
      Effect.provideService(
        Worker.WorkerPlatform,
        makeTabPlatform({
          buildId,
          skew,
          livenessMs: Duration.toMillis(
            options?.livenessInterval ?? '5 seconds',
          ),
        }),
      ),
      Effect.provideService(Worker.Spawner, () => container),
    );
    const client: Client<Rpcs> = yield* RpcClient.make(group).pipe(
      Effect.provideService(
        RpcClient.Protocol,
        withVersionSkew(protocol, skew),
      ),
    );
    return client;
  });

/**
 * One tab's Worker RPC connection. Every message goes through the current
 * controller, carrying the tab's Build ID (from the meta tag `pwaHead()`
 * renders). Calls wait for a controller when the tab has none yet.
 *
 * - Version Skew: a worker of another Build ID refuses the connection, and
 *   calls fail with `VersionSkew` until a new controller takes over. The app
 *   may answer it with `PwaUpdate.check`.
 * - Worker restart: the browser may stop the worker at any time. Calls in
 *   flight then fail with `RpcClientError` (found at the next message, or
 *   within the liveness interval), and the Tab Client connects again on its
 *   own. A stream is never resumed where it stopped: Subscription Restart
 *   means subscribing again (e.g. `Stream.retry`), and the handler starts
 *   over from the current state, so it must emit everything a fresh
 *   subscriber needs.
 */
export const TabClient = {
  make,
  layer: <Id, Rpcs extends Rpc.Any>(
    tag: Context.Key<Id, Client<Rpcs>>,
    group: RpcGroup.RpcGroup<Rpcs>,
    options?: Options,
  ): Layer.Layer<Id, WorkerError, Rpc.MiddlewareClient<Rpcs>> =>
    Layer.effect(tag)(make(group, options)),
};
