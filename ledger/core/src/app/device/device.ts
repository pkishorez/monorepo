import { Layer } from 'effect';
import type { Platform } from '@kstackz/auth-toolkit/client';
import { authz } from '@kstackz/auth-toolkit/server';
import { ledgerBackend } from '../../backend/backend.ts';
import { tableDevice } from '../../backend/services/table/device.ts';

/**
 * The device Backend: the Backend itself, run in this process on the
 * device's own table, for whoever a Name Token names, so nothing reaches a
 * server.
 */
export const deviceBackend = (platform: Platform) =>
  ledgerBackend.pipe(Layer.provide([tableDevice(platform), authz.device]));
