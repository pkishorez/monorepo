/**
 * Vibrates the device with the Vibration API's pattern: one duration, or
 * alternating on and off durations, in ms. Does nothing where the API is
 * missing (iOS, Firefox, desktop) or the browser refuses it, as Chrome does
 * until the user has first touched the page.
 */
export const vibrate = (pattern: number | ReadonlyArray<number>): void => {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
};
