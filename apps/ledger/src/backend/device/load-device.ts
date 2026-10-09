import type { Storage } from '@kstackz/web-platform/define';

/**
 * The device Backend's code, loaded the first time someone chooses it: a
 * chunk of its own, so those on the cloud Backend never fetch it.
 */
export const device = async (storage: Storage) =>
  (await import('./device.ts')).deviceBackends(storage);
