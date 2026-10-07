import { createLedger } from '@ledger/core/app';
import { webPlatform } from './platform.ts';
import { createTheme } from '@kstackz/web-platform/theme';
import { AUTH_URL } from './stage.ts';

// The theme cookie is shared by every app under the same domain.
const cookieDomain =
  typeof location === 'undefined'
    ? undefined
    : location.hostname.endsWith('.kishore.app')
      ? 'kishore.app'
      : location.hostname.endsWith('.kishore.computer')
        ? 'kishore.computer'
        : undefined;

export const appTheme = createTheme({ cookieDomain });

/** Ledger in the browser: the one every screen uses. */
export const {
  SignedIn,
  useAccounts,
  useGate,
  // The open user's session; core's own `useSession` reads it inside.
  useSession: useOpenSession,
  useSettings,
} = createLedger(() => webPlatform({ name: 'ledger', authUrl: AUTH_URL }));
