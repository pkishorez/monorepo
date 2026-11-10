import { Context, Data, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import type { RpcClient, RpcClientError } from 'effect/rpc';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import {
  versionedClient,
  type VersionGap,
} from '@kestack/rpc-toolkit/rpc/version-gap';
import {
  HEARTBEAT_PATH,
  HeartbeatApi,
  UPGRADE_REQUIRED,
  VERSION_HEADER,
} from '../../../../../heartbeat/index.js';

/*
 * Connect Cloud as `ke-connect` calls it: `HeartbeatApi` over HTTP at
 * `<cloud>/heartbeat`, every call signed by the Connection's Sign-in
 * (auth-toolkit's `device()`) and carrying this `ke-connect`'s version in
 * `ke-connect-version`, each failing with `VersionGap` when one side is older.
 *
 * Below the Minimum Connect, Connect Cloud answers 426 and one line of plain
 * text (ADR 0011). That is read off the HTTP response itself, before anything
 * is taken as RPC, so it never hangs on the RPC framing: the call fails
 * `Outdated`, with the line.
 */

/** This `ke-connect` is older than Connect Cloud accepts: `line` says so, and what to do. */
export class Outdated extends Data.TaggedError('Outdated')<{
  readonly line: string;
}> {
  override get message() {
    return this.line;
  }
}

/** `base` without a trailing slash, then `path`. */
const at = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

/**
 * `call`, failing `Outdated` when Connect Cloud answered it 426: the `fetch`
 * it runs on, whichever is provided, keeps the line and fails the request.
 */
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
  '@kestack/connect/HeartbeatClient',
) {
  /**
   * Connect Cloud at `cloud`, its base URL such as
   * `https://connect.kishore.app`, called as `ke-connect` at `version`.
   */
  static readonly layer = (cloud: string, version: string) =>
    Layer.effect(
      HeartbeatClient,
      Effect.map(versionedClient(HeartbeatApi), (rpc): Calls => ({
        Report: (...args) => outdatedOn(rpc.Report(...args)),
        Forget: (...args) => outdatedOn(rpc.Forget(...args)),
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
