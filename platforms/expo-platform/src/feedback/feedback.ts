import { buzz, type Haptic } from './haptics';

/**
 * Plays one haptic. Fire and forget: a device without a haptic engine, or
 * one with haptics turned off, simply feels nothing.
 */
export function haptic(kind: Haptic): void {
  buzz(kind).catch(() => {});
}
