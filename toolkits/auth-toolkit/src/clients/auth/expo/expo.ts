import { Layer } from 'effect';
import { Auth } from '../service/index.js';
import { type AuthExpoConfig, makeAuth } from './accounts.js';
import { nativeDevice } from './native-device.js';

/** Auth on a phone: every User signs in as the app's First-Party OAuth
 * client, with PKCE, in the system sign-in sheet (never a web view), and
 * keeps their own Access and refresh tokens in the device's secure storage.
 * `list` refreshes an Access Token about to expire (the refresh token turns
 * over each time), Sign Out revokes the refresh token, and the Account
 * Switch changes which User is active on this device alone. */
export const authExpo = (config: AuthExpoConfig) =>
  Layer.sync(Auth, () => makeAuth(config, nativeDevice()));

/** Opens the Auth Worker's Home Page in the system browser, which shares
 * the sign-in sheet's cookies: where a User manages the Google accounts
 * signed in there. */
export const manageAccounts = (authWorkerUrl: string): Promise<void> =>
  nativeDevice().open(authWorkerUrl);
