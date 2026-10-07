import { Layer } from 'effect';
import type { Storage } from '@kstackz/platform-toolkit';
import { authz } from '@kstackz/auth-toolkit/server';
import { ledgerBackend } from '../backend.ts';
import { tableDevice } from '../services/table/device.ts';

/**
 * The device Backend: every API's handlers run in this process on the
 * device's own table, for whoever a Name Token names, so nothing reaches a
 * server.
 */
export const deviceBackends = (storage: Storage) => ({
  ledger: ledgerBackend.pipe(
    Layer.provide([tableDevice(storage), authz.device]),
  ),
});
