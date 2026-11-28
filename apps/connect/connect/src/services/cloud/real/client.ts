import { Context, Data, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import type { RpcClient, RpcClientError } from 'effect/rpc';
import {
  HEARTBEAT_PATH,
  HeartbeatApi,
  UPGRADE_REQUIRED,
  VERSION_HEADER,
} from '@kestack/connect-cloud/heartbeat';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import {
  versionedClient,
  type VersionGap,
} from '@kestack/rpc-toolkit/rpc/version-gap';

export class Outdated extends Data.TaggedError('Outdated')<{
  readonly line: string;
}> {
  override get message() {
    return this.line;
  }
}

const at = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

const outdatedOn = <A, E, R>(call: Effect.Effect<A, E, R>) =>
  Effect.flatMap(Effect.service(FetchHttpClient.Fetch), (fetch) => {
    let outdated: Outdated | null = null;
    const watched: typeof globalThis.fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (response.status !== UPGRADE_REQUIRED) return response;
      outdated = new Outdated({ line: (await response.text()).trim() });
      throw outdated;
    };
    return call.pipe(
      Effect.provideService(FetchHttpClient.Fetch, watched),
      Effect.catch((error) => Effect.fail(outdated ?? error)),
    );
  });

type Calls = RpcClient.FromGroup<
  typeof HeartbeatApi,
  RpcClientError.RpcClientError | VersionGap | Outdated
>;

export class HeartbeatClient extends Context.Service<HeartbeatClient, Calls>()(
  'Connect/service/Cloud/HeartbeatClient',
) {
  static readonly layer = (cloud: string, version: string) =>
    Layer.effect(
      HeartbeatClient,
      Effect.map(versionedClient(HeartbeatApi), (rpc): Calls => ({
        Report: (...args) => outdatedOn(rpc.Report(...args)),
        Remove: (...args) => outdatedOn(rpc.Remove(...args)),
      })),
    ).pipe(
      Layer.provide(
        client(HeartbeatApi, {
          url: at(cloud, HEARTBEAT_PATH),
          headers: { [VERSION_HEADER]: version },
        }),
      ),
    );
}
