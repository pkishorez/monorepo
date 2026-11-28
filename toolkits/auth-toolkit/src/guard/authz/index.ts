export { Authz } from './authz.js';
// The errors as their own names too, so a package that publishes a guarded
// client's type can name them in its declarations.
export {
  AccountChanged,
  Forbidden,
  Unauthenticated,
  Unavailable,
} from './middleware/index.js';

export type { Guard, Guarded, PolicyGuard, Principal } from './authz.js';
