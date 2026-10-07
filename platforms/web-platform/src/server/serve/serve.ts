import { Layer } from 'effect';
import type { Apis, RpcsOf } from '@kstackz/platform-toolkit';
import type { Rpc as EffectRpc } from 'effect/rpc';
import { authz } from '@kstackz/auth-toolkit/server/cloud';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { webServer } from '../worker/index.ts';

/** One API's handlers on the cloud Backend, with the services they stand
 * on given; who signed a call is given by `createServer` when the app has
 * auth. */
export type CloudBackend<Rpcs extends EffectRpc.Any> = Layer.Layer<
  EffectRpc.ToHandler<Rpcs> | EffectRpc.Middleware<Rpcs>,
  unknown,
  // oxlint-disable-next-line no-explicit-any
  any
>;

export interface ServerConfig<A extends Apis, Env> {
  /** The app's APIs, as its client names them. Each served here is an
   * `http` API at a path; a `websocket` API and one at a full URL are
   * served elsewhere. */
  readonly apis: A;
  /** Every API's handlers on the cloud Backend, made for one request from
   * the platform's own context, such as a Worker's `env`. */
  readonly backend: (env: Env) => {
    readonly [K in keyof A]?: CloudBackend<RpcsOf<A[K]>>;
  };
  /** The shared sign-in service, for an app with auth: each call is
   * checked for the Account its token or cookie names, and the sign-in
   * cookies refreshed while checking go back on the answer. `resource` is
   * the audience an Access Token must be for, as a phone's is. */
  readonly auth?: {
    readonly url: string;
    readonly resource?: string | undefined;
  };
}

const isUrl = (path: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(path);
const normal = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`;

/**
 * A web app's server: each of its `http` APIs at its path, on the cloud
 * Backend, and everything else the app's pages, from TanStack Start. A
 * plain fetch handler, so it is a Cloudflare Worker's default export as it
 * is.
 */
export const createServer = <A extends Apis, Env>(
  config: ServerConfig<A, Env>,
) => {
  const served = Object.entries(config.apis).filter(
    ([, api]) => api.transport === 'http' && !isUrl(api.path),
  );
  const { auth } = config;
  return webServer<Env>({
    route: (request, env) => {
      const path = normal(new URL(request.url).pathname);
      const found = served.find(([, api]) => normal(api.path) === path);
      if (found === undefined) return null;
      const [name, api] = found;
      const handlers = config.backend(env)[name as keyof A];
      if (handlers === undefined)
        return Promise.resolve(new Response('Not found', { status: 404 }));
      const layer = (
        auth === undefined
          ? handlers
          : handlers.pipe(
              Layer.provide(
                authz.cloud({
                  authWorkerUrl: auth.url,
                  ...(auth.resource !== undefined && {
                    resource: auth.resource,
                  }),
                }),
              ),
            )
      ) as never;
      return Rpc.http.server(
        api.group,
        layer,
        ...(auth === undefined ? [] : [{ wrap: authz.cookies }]),
      )(request);
    },
  });
};
