import type { Platform } from '@kstackz/auth-toolkit/client';

/**
 * The device Backend's code, loaded the first time someone chooses it: on
 * the web it is a chunk of its own, so those on the cloud Backend never
 * fetch it. A phone loads `load-device.native.ts` instead.
 */
export const loadDevice = async (platform: Platform) =>
  (await import('./device.ts')).deviceBackend(platform);
