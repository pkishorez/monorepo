import { auth } from '../current-auth/index.js';
import { cannotation } from './cannotation.js';

export const Authz: typeof auth & {
  readonly guard: (typeof cannotation)['with'];
} = { ...auth, guard: cannotation.with };
