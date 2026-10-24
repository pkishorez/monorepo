import { middleware } from '@kestack/rpc-toolkit/rpc';

import { Failure } from './errors.js';
import { User, type Policy } from './guard.js';

/** The Guard as an Rpc Middleware: its server half is `server`'s
 * `auth.rpc()`; its client half comes with the `client/browser` and
 * `client/device` Layers. */
export const rpcMiddleware = /*#__PURE__*/ middleware<Policy>()(
  '@kestack/auth-toolkit/rpc/Auth',
  { provides: User, error: Failure },
);
