import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { resolverLive } from '@kstackz/auth-toolkit/server/resolver-live';

/**
 * Who a call is from, in the cloud: a Session token (the web app) or an
 * Access Token for `resource` (native apps), both asked of or checked
 * against the sign-in service at `authUrl`.
 */
export const authCloud = (options: {
  readonly authUrl: string;
  readonly resource: string;
}) =>
  resolverLive({
    authWorkerUrl: options.authUrl,
    resource: options.resource,
  }).pipe(
    Layer.provide(
      FetchHttpClient.layer.pipe(
        // Redirects are looked at before any credentials go elsewhere.
        Layer.provide(
          Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'manual' }),
        ),
      ),
    ),
  );
