import { Layer } from 'effect';
import type { Apis, RpcsOf } from '../../define/index.ts';
import type { Rpc as EffectRpc } from 'effect/rpc';
import type { Principal } from '@kestack/auth-toolkit';
import { auth as guard } from '@kestack/auth-toolkit/server/rpc';
import { Rpc } from '@kestack/rpc-toolkit/rpc';
import { forOwner, type LiveAuth, liveCaller, refusal } from '../live/index.ts';
import { webServer } from '../worker/index.ts';

/** One API's handlers on the cloud Backend, with the services they stand
 * on given; who signed a call is given by `createServer` when the app has
 * auth, so the handlers need nothing of auth's. */
export type CloudBackend<Rpcs extends EffectRpc.Any> = Layer.Layer<
  EffectRpc.ToHandler<Rpcs>,
  unknown,
  // oxlint-disable-next-line no-explicit-any
  any
>;

/** Where a Worker reaches its Live Objects, one per name: a Durable
 * Object namespace binding. */
export interface LiveNamespace {
  readonly getByName: (name: string) => {
    readonly fetch: (request: Request) => Promise<Response>;
  };
}

export interface ServerConfig<A extends Apis, Env> {
  /** The app's APIs, as its client names them. Each served here is at a
   * path: an `http` API by `backend`, a `websocket` one by the caller's own
   * Live Object in `live`. One at a full URL is served elsewhere. */
  readonly apis: A;
  /** Every `http` API's handlers on the cloud Backend, made for one request
   * from the platform's own context, such as a Worker's `env`. */
  readonly backend?: (env: Env) => {
    readonly [K in keyof A]?: CloudBackend<RpcsOf<A[K]>>;
  };
  /** Every `websocket` API's Live Objects, from the Worker's `env`. A socket
   * opens at the object named for whoever the sign-in cookie on its upgrade
   * names, so needs `auth`. */
  readonly live?: (env: Env) => { readonly [K in keyof A]?: LiveNamespace };
  /** The shared sign-in service, for an app with auth: each call is
   * checked for the Account its cookie (or a Device's token) names, and the
   * sign-in cookies refreshed while checking go back on the answer. `oauth`
   * lets in Access Tokens for that Resource Server too, such as an MCP
   * client's. */
  readonly auth?: LiveAuth;
}

const isUrl = (path: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(path);
const normal = (path: string) => `/${path.replace(/^\/+|\/+$/g, '')}`;

/**
 * A web app's server: each of its `http` APIs at its path, on the cloud
 * Backend, each `websocket` one at its path in the caller's own Live
 * Object, and everything else the app's pages, from TanStack Start. A
 * plain fetch handler, so it is a Cloudflare Worker's default export as it
 * is.
 */
export const createServer = <A extends Apis, Env>(
  config: ServerConfig<A, Env>,
) => {
  const served = Object.entries(config.apis).filter(
    ([, api]) => !isUrl(api.path),
  );
  const { auth } = config;
  // A socket for the object of whoever its upgrade's cookie names.
  const openLive = async (request: Request, objects: LiveNamespace) => {
    if (auth === undefined)
      return new Response('A Live Object needs auth', { status: 500 });
    const caller = await liveCaller(request, auth);
    const refused = refusal(caller);
    if (refused !== null) return refused;
    const owner = (caller as Principal).user.id;
    return objects.getByName(owner).fetch(forOwner(request, owner));
  };
  // Who signed each call, for an app with auth.
  const signed = auth === undefined ? null : guard(auth);
  return webServer<Env>({
    route: (request, env) => {
      const path = normal(new URL(request.url).pathname);
      const found = served.find(([, api]) => normal(api.path) === path);
      if (found === undefined) return null;
      const [name, api] = found;
      if (api.transport === 'websocket') {
        const objects = config.live?.(env)[name as keyof A];
        return objects === undefined
          ? Promise.resolve(new Response('Not found', { status: 404 }))
          : openLive(request, objects);
      }
      const handlers = config.backend?.(env)[name as keyof A];
      if (handlers === undefined)
        return Promise.resolve(new Response('Not found', { status: 404 }));
      const layer = (
        signed === null ? handlers : Layer.merge(signed, handlers)
      ) as never;
      return Rpc.http.server(api.group, layer)(request);
    },
  });
};
