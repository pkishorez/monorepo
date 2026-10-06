import {
  authExpo,
  manageAccounts,
} from '@kstackz/auth-toolkit/clients/auth/expo';
import { createURL } from 'expo-linking';

// The Remote Backend for each kind of build: the Mac's local servers while
// developing, Ledger's own addresses in a release. `resource` is the
// audience Ledger's `/rpc` checks on an Access Token, one per stage, so it
// stays the same whichever local Ledger address the app is pointed at.
const STAGES = {
  local: {
    ledgerUrl: 'https://kstack.kishore.computer',
    authUrl: 'https://auth.kishore.computer',
    resource: 'https://kstack.kishore.computer/rpc',
  },
  prod: {
    ledgerUrl: 'https://kstack.kishore.app',
    authUrl: 'https://auth.kishore.app',
    resource: 'https://kstack.kishore.app/rpc',
  },
};

// Native Ledger's First-Party Client in the sign-in service's config.
const CLIENT_ID = 'ledger';

/**
 * The Remote Backend as a phone reaches it: each User signs in as Ledger's
 * First-Party Client in the system sign-in sheet (OAuth + PKCE, Ledger ADR
 * 0009) and keeps their own tokens in secure storage; `/rpc` answers at
 * `ledgerUrl`. `EXPO_PUBLIC_LEDGER_URL`, `EXPO_PUBLIC_AUTH_URL` and
 * `EXPO_PUBLIC_LEDGER_RESOURCE` override the stage's addresses.
 */
export const makeRemote = () => {
  const stage = __DEV__ ? STAGES.local : STAGES.prod;
  // Read one by one: Expo inlines only `process.env.EXPO_PUBLIC_<NAME>`.
  const ledgerUrl = process.env.EXPO_PUBLIC_LEDGER_URL ?? stage.ledgerUrl;
  const authUrl = process.env.EXPO_PUBLIC_AUTH_URL ?? stage.authUrl;
  const resource = process.env.EXPO_PUBLIC_LEDGER_RESOURCE ?? stage.resource;
  return {
    auth: authExpo({
      authWorkerUrl: authUrl,
      clientId: CLIENT_ID,
      // `ledger://oauth/callback` in a development or release build;
      // `exp://<metro host>/--/oauth/callback` in Expo Go.
      redirectUri: createURL('oauth/callback'),
      resource,
      storageKey: 'ledger.auth',
    }),
    ledgerUrl,
    manageAccounts: () => manageAccounts(authUrl),
  };
};
