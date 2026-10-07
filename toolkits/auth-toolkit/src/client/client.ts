import { named } from './sign-in/named/index.js';

/**
 * How an Account signs in on the device Backend: `named`, by name. The
 * sign-ins against the sign-in service each have their own door, because
 * each brings what its place needs: `cookie` (a browser, better-auth) in
 * `@kstackz/auth-toolkit/client/web`, `oauth` (a phone, Expo) in
 * `@kstackz/auth-toolkit/client/expo`, `deviceCode` (a CLI, Node) in
 * `@kstackz/auth-toolkit/client/cli`.
 */
export const signIn = { named };

export {
  type App,
  type AppConfig,
  createApp,
  type DeviceBackend,
  keepSyncs,
  type ApiClient,
  type SessionContext,
  type StdSync,
} from './app/index.js';
export {
  Backend,
  backendNamed,
  SignIn,
  Unreachable,
  type Account,
  type LoginError,
  type SignInOptions,
  type User,
} from './account/index.js';
export {
  createGate,
  gateReact,
  type Gate,
  type GateConfig,
  type GateNotice,
  type GateReact,
  type GateView,
} from './gate/index.js';
export {
  memoryPlatform,
  type Platform,
  type TableSource,
  type TabMessage,
} from './platform/index.js';
export {
  namedAccountsTable,
  namedChooser,
  type NamedChoice,
  type NamedOptions,
} from './sign-in/named/index.js';
export { nameToken, namedUser } from '../contract/index.js';
