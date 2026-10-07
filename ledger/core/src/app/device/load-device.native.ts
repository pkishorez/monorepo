import type { Platform } from '@kstackz/auth-toolkit/client';
import { deviceBackend } from './device.ts';

/**
 * The device Backend's code, already in the bundle: a phone ships all of
 * its code in the app, so there is no chunk worth splitting off, and Metro
 * can fetch a lazily imported chunk only from its development server. A
 * production bundle that imported it lazily would wait on it forever.
 */
export const loadDevice = async (platform: Platform) => deviceBackend(platform);
