import { Layer } from 'effect';
import { Headers } from 'effect/http';
import { RpcMiddleware } from 'effect/rpc';
import { MachinesApi } from '../../machines/contract/index.js';

/*
 * Local mode: the Backend trusts whoever a Local Token names, so a Machine
 * signs every call with one made from `--as`.
 *
 * auth-toolkit keeps `localToken` and `localUser` in a module its package
 * does not export, so their two lines are repeated here. The format is
 * fixed on its side: a Local Token's prefix and a Local Account's id are
 * kept on devices and never change.
 */

const toBase64Url = (text: string) =>
  Buffer.from(text, 'utf8').toString('base64url');

/** The Local Account an email names: the same email is always the same User. */
export const localUser = (input: { readonly email: string }) => {
  const email = input.email.trim().toLowerCase();
  return {
    id: `local_${toBase64Url(email)}`,
    email,
    name: email.split('@')[0] || email,
  };
};

/** The Local Token that carries `user`. */
export const localToken = (user: {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}) =>
  `local.${toBase64Url(JSON.stringify({ id: user.id, email: user.email, name: user.name }))}`;

/** The Guard's RPC Middleware, as the Machines contract carries it. */
const guard = (() => {
  for (const rpc of MachinesApi.requests.values())
    for (const middleware of rpc.middlewares)
      if (middleware.key === '@kestack/auth-toolkit/rpc/Auth')
        return middleware;
  throw new Error('The Machines contract carries no auth Guard');
})();

/** Signs every guarded Machines call with `token` as a bearer. */
export const bearerSigning = (token: string): Layer.Layer<unknown> =>
  RpcMiddleware.layerClient(guard as never, ({ request, next }) =>
    next({
      ...request,
      headers: Headers.set(request.headers, 'authorization', `Bearer ${token}`),
    }),
  ) as Layer.Layer<unknown>;
