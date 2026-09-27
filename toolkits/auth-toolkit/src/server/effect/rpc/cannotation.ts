import { Cannotation } from '@kstackz/rpc-toolkit/rpc/cannotation';

import {
  AuthFailure,
  auth,
  type AuthPolicy,
} from '../../current-auth/index.js';

export const cannotation = Cannotation.make<AuthPolicy>()(
  '@kstackz/auth-toolkit/rpc/Authz',
  {
    provides: auth.CurrentAuth,
    error: AuthFailure,
  },
);
