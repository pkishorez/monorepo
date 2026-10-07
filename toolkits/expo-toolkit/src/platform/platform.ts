import type { AppPlatform } from '@kstackz/auth-toolkit/app';
import {
  authExpo,
  manageAccounts,
} from '@kstackz/auth-toolkit/clients/auth/expo';
import { createURL } from 'expo-linking';
import { expoGatePlatform } from './gate';
import { makeStorage } from './storage';

/**
 * An Expo app's platform, for auth-toolkit's `createApp`: each table in an
 * expo-sqlite file of its database's name, Std Sync in `copies.db`, cloud
 * sign-in as the app's First-Party Client (`clientId`) in the system
 * sign-in sheet with each user's tokens in secure storage,
 * the cloud API at `apiUrl`, and the Gate's memory in secure storage under
 * `name`, with the network from expo-network and the foreground from
 * AppState. Made on first use: pass it as a function.
 */
export const expoPlatform = (options: {
  readonly name: string;
  /** Where the cloud Backend's API answers. */
  readonly apiUrl: string;
  /** The sign-in service. */
  readonly authUrl: string;
  /** The app's First-Party Client at the sign-in service. */
  readonly clientId: string;
  /** The audience the cloud API checks an Access Token for. */
  readonly resource: string;
}): AppPlatform['Service'] => ({
  ...makeStorage(),
  cloud: {
    auth: authExpo({
      authWorkerUrl: options.authUrl,
      clientId: options.clientId,
      // `<scheme>://oauth/callback` in a development or release build;
      // `exp://<metro host>/--/oauth/callback` in Expo Go.
      redirectUri: createURL('oauth/callback'),
      resource: options.resource,
      storageKey: `${options.name}.auth`,
    }),
    url: options.apiUrl,
    manageAccounts: () => manageAccounts(options.authUrl),
  },
  gate: expoGatePlatform(options.name),
});
