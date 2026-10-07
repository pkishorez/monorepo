import type { Storage } from '@kstackz/platform-toolkit';

/**
 * The device Backend's code, loaded the first time someone chooses it: on
 * the web it is a chunk of its own, so those on the cloud Backend never
 * fetch it. A phone loads `load-device.native.ts` instead.
 */
export const device = async (storage: Storage) =>
  (await import('./device.ts')).deviceBackends(storage);
