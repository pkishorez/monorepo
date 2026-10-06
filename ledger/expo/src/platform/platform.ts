import { Layer } from 'effect';
import { LedgerPlatform } from '@ledger/core/client/platform';
import { lastUser } from './last-user';
import { makeLifecycle } from './lifecycle';
import { remote } from './remote';
import { makeStorage } from './storage';

/**
 * Ledger on a phone: tables and Remote copies in expo-sqlite, the last User
 * in secure storage, the network from expo-network and the foreground from
 * AppState. Signing in to the Remote Backend arrives in Phase 4. Made on
 * first use, once.
 */
export const expoPlatform = Layer.sync(LedgerPlatform, () => ({
  storage: makeStorage(),
  lastUser,
  remote,
  lifecycle: makeLifecycle(),
}));
