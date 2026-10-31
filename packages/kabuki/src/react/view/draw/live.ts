import { use, useSyncExternalStore } from 'react';
import { AppContext } from './view.tsx';

const never = () => false;
const noop = () => () => {};

/**
 * Whether the app is drawn as it is now, not at a past Step, as Time Travel
 * shows it: what an effect that touches the page around the app, like its
 * scroll, reads first. Outside an app, always; on a server, never.
 */
export const useLive = (): boolean => {
  const drawn = use(AppContext);
  return useSyncExternalStore(
    drawn?.subscribe ?? noop,
    drawn?.live ?? (() => true),
    never,
  );
};
