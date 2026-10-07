import { expoPlatform } from '@kstackz/expo-toolkit/platform';
import { createLedger } from '@ledger/core/app';

// The cloud Backend for each kind of build: the Mac's local servers while
// developing, Ledger's own addresses in a release. `resource` is the
// audience Ledger's `/rpc` checks on an Access Token, one per stage, so it
// stays the same whichever local Ledger address the app is pointed at.
const STAGES = {
  local: {
    apiUrl: 'https://kstack.kishore.computer',
    authUrl: 'https://auth.kishore.computer',
    resource: 'https://kstack.kishore.computer/rpc',
  },
  prod: {
    apiUrl: 'https://kstack.kishore.app',
    authUrl: 'https://auth.kishore.app',
    resource: 'https://kstack.kishore.app/rpc',
  },
};

/**
 * Where this build's cloud Backend is. `EXPO_PUBLIC_LEDGER_URL`,
 * `EXPO_PUBLIC_AUTH_URL` and `EXPO_PUBLIC_LEDGER_RESOURCE` override the
 * stage's addresses.
 */
const stage = () => {
  const chosen = __DEV__ ? STAGES.local : STAGES.prod;
  // Read one by one: Expo inlines only `process.env.EXPO_PUBLIC_<NAME>`.
  return {
    apiUrl: process.env.EXPO_PUBLIC_LEDGER_URL ?? chosen.apiUrl,
    authUrl: process.env.EXPO_PUBLIC_AUTH_URL ?? chosen.authUrl,
    resource: process.env.EXPO_PUBLIC_LEDGER_RESOURCE ?? chosen.resource,
  };
};

/** Ledger on the phone: the one every screen uses. Users sign in to the
 * cloud as Ledger's First-Party Client (Ledger ADR 0009). */
export const {
  SignedIn,
  useAccounts,
  useGate,
  // The open user's session; core's own `useSession` reads it inside.
  useSession: useOpenSession,
  useSettings,
} = createLedger(() =>
  expoPlatform({ name: 'ledger', clientId: 'ledger', ...stage() }),
);
