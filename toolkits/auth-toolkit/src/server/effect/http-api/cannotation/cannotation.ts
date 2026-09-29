import { Cannotation } from '@kstackz/rpc-toolkit/http/cannotation';

import {
  AuthFailures,
  auth,
  type AuthPolicy,
} from '../../current-auth/index.js';

export const cannotation = Cannotation.make<AuthPolicy>()(
  '@kstackz/auth-toolkit/http-api/Authz',
  {
    provides: auth.CurrentAuth,
    error: AuthFailures,
  },
);
