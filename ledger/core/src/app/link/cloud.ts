import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { AppPlatform } from '@kstackz/auth-toolkit/app';
import { BackendLink } from './link.ts';

/**
 * The link to the cloud Backend: each session over HTTP to the Ledger API
 * at the platform's cloud address, its Std Sync kept on the platform so it
 * opens offline.
 */
export const cloudLink = Layer.effect(
  BackendLink,
  Effect.map(AppPlatform, ({ cloud, sync }) => ({
    // A call carries its session's token and never a cookie, which names
    // whoever is active in the browser.
    api: RpcClient.layerProtocolHttp({
      url: `${cloud.url.replace(/\/$/, '')}/rpc`,
    }).pipe(
      Layer.provide([
        FetchHttpClient.layer.pipe(
          Layer.provide(
            Layer.succeed(FetchHttpClient.RequestInit, {
              credentials: 'omit',
            }),
          ),
        ),
        RpcSerialization.layerNdjson,
      ]),
    ),
    syncPlatform: sync,
  })),
);
