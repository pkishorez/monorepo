import { Layer } from 'effect';
import { SignIn } from '../../account/index.js';
import { makeOAuth, type OAuthOptions } from './accounts.js';
import { nativeDevice } from './native-device.js';

/** Sign-in on a phone: every User signs in as the app's First-Party OAuth
 * client, with PKCE, in the system sign-in sheet (never a web view), and
 * keeps their own Access and refresh tokens in the device's secure storage.
 * `list` refreshes an Access Token about to expire (the refresh token turns
 * over each time), Sign Out revokes the refresh token, and the Account
 * Switch changes which User is active on this device alone. */
export const oauth = (options: OAuthOptions) =>
  Layer.sync(SignIn, () => makeOAuth(options, nativeDevice()));

/** Opens the Auth Worker's Home Page in the system sign-in sheet, signed in
 * as its sign-ins left it (Safari's cookies are not the sheet's on iOS):
 * where a User manages the Google accounts signed in there. iOS asks first,
 * as for a sign-in. */
export const manageAccounts = (authWorkerUrl: string): Promise<void> =>
  nativeDevice().open(authWorkerUrl);
