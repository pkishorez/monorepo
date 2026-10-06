import { createLedger } from '@ledger/core/client/gate';
import { expoPlatform } from '../platform';

/** Ledger's client, run on the phone's platform: the one every screen uses. */
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
} = createLedger(expoPlatform);
