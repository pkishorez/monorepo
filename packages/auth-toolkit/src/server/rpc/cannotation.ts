import { Cannotation } from 'rpc-toolkit/rpc/cannotation';

import { AuthFailure, auth, type AuthPolicy } from '../current-auth/index.js';

export const cannotation = Cannotation.make<AuthPolicy>()(
  'auth-toolkit/rpc/Authz',
  {
    provides: auth.CurrentAuth,
    error: AuthFailure,
  },
);
