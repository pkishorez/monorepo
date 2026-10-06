import { createLedger } from '@ledger/core/client/gate';
import { webPlatform } from '../platform/index.ts';

export { appTheme } from './theme.ts';

/** Ledger's client, run on the web platform: the one every screen uses. */
export const {
  addUser,
  checkAgain,
  setBackend,
  signOut,
  signOutEveryone,
  switchUser,
  takeLoginError,
  useApp,
  useBackend,
  useChangeSettings,
  useLocalSignIn,
  useOnline,
  useSettings,
} = createLedger(webPlatform);
