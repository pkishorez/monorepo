import { useSyncExternalStore } from 'react';

/*
 * The time now, to the second, for a countdown: each View that reads it is
 * drawn again once a second. The server, and the browser as it hydrates,
 * read 0, so what the server drew is what the browser starts from.
 */

const second = () => Math.floor(Date.now() / 1000) * 1000;
const unknown = () => 0;

const subscribe = (changed: () => void) => {
  const timer = setInterval(changed, 1000);
  return () => clearInterval(timer);
};

/** The time now, in milliseconds, read again every second; 0 until the app runs. */
export const useNow = () => useSyncExternalStore(subscribe, second, unknown);
