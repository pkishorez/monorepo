export {
  Authz,
  type Guard,
  type Guarded,
  type PolicyGuard,
  type Principal,
} from './auth.js';
// The errors as their own names too, so a package that publishes a guarded
// client's type can name them in its declarations.
export {
  AccountChanged,
  Forbidden,
  Unauthenticated,
  Unavailable,
} from '../guard/index.js';
