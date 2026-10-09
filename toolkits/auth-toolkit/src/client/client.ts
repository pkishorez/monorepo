import { named } from './sign-in/named/index.js';

/**
 * How an Account signs in on the device Backend: `named`, by name. The
 * sign-ins against the sign-in service each have their own door, because
 * each brings what its place needs: `cookie` (a browser, better-auth) in
 * `@kstackz/auth-toolkit/client/web`, `deviceCode` (a CLI, Node) in
 * `@kstackz/auth-toolkit/client/cli`. Running sign-in on a device, the Gate
 * and each Account's Session, is the Platform Toolkit's.
 */
export const signIn = { named };

export {
  SignIn,
  Unreachable,
  type Account,
  type Listed,
  type LoginError,
  type SignInOptions,
  type User,
} from './account/index.js';
export {
  namedAccountsTable,
  namedChooser,
  type NamedChoice,
  type NamedOptions,
} from './sign-in/named/index.js';
export { nameToken, namedUser } from '../contract/index.js';
