import { middleware } from '@kestack/rpc-toolkit/http-api';

import { Failures } from './errors.js';
import { User, type Policy } from './guard.js';

/** The Guard as an HttpApi Middleware: its server half is `server`'s
 * `auth.http()`; its client half comes with the `client/browser` and
 * `client/device` Layers. */
export const httpMiddleware = /*#__PURE__*/ middleware<Policy>()(
  '@kestack/auth-toolkit/http-api/Auth',
  { provides: User, error: Failures },
);
