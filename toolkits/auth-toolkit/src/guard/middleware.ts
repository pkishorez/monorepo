import { HttpApi } from '@kstackz/rpc-toolkit/http-api';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { Current, Failure, Failures, type Policy } from './current.js';

/** The guard as an Rpc Middleware: `with` attaches it, `layer` is its
 * server half (`authz.layer`), `client` its client half (`Authz.bearer`). */
export const rpcMiddleware = Rpc.middleware<Policy>()(
  '@kstackz/auth-toolkit/rpc/Authz',
  { provides: Current, error: Failure },
);

/** The guard as an HttpApi Middleware. */
export const httpMiddleware = HttpApi.middleware<Policy>()(
  '@kstackz/auth-toolkit/http-api/Authz',
  { provides: Current, error: Failures },
);
