import { Layer } from 'effect';
import { LedgerPlatform } from '@ledger/core/client/platform';
import { lastUser } from './last-user';
import { makeLifecycle } from './lifecycle';
import { makeRemote } from './remote';
import { makeStorage } from './storage';

/**
 * Ledger on a phone: tables and Remote copies in expo-sqlite, the last User
 * in secure storage, the Remote Backend's Users signed in through the system
 * sign-in sheet with their tokens in secure storage, the network from
 * expo-network and the foreground from AppState. Made on first use, once.
 */
export const expoPlatform = Layer.sync(LedgerPlatform, () => ({
  storage: makeStorage(),
  lastUser,
  remote: makeRemote(),
  lifecycle: makeLifecycle(),
}));
