import {
  type Backend,
  backendNamed,
  type GatePlatform,
  type TabMessage,
} from '@kstackz/auth-toolkit/gate';

// `?backend=device` or `?backend=cloud` (or their former names, `local` and
// `remote`) chooses the Backend, as Settings would, and leaves the address.
const launchBackend = (): Backend | null => {
  const url = new URL(window.location.href);
  const asked = backendNamed(url.searchParams.get('backend'));
  if (asked === null) return null;
  url.searchParams.delete('backend');
  window.history.replaceState(window.history.state, '', url.href);
  return asked;
};

const onOnlineChange = (changed: () => void) => {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
};

const onForeground = (shown: () => void) => {
  const changed = () => {
    if (document.visibilityState === 'visible') shown();
  };
  document.addEventListener('visibilitychange', changed);
  return () => document.removeEventListener('visibilitychange', changed);
};

/**
 * The Gate in a browser, but for its table: the window's own network and
 * visibility events, and every other tab of this origin over one
 * BroadcastChannel. Made in the browser only.
 */
export const webGatePlatform = (name: string): Omit<GatePlatform, 'table'> => {
  const channel = new BroadcastChannel(`${name}:gate`);
  return {
    lifecycle: {
      online: () => navigator.onLine,
      onOnlineChange,
      onForeground,
      launchBackend,
    },
    tabs: {
      announce: (message) => channel.postMessage(message),
      listen: (heard) => {
        const listener = (event: MessageEvent<TabMessage>) => heard(event.data);
        channel.addEventListener('message', listener);
        return () => channel.removeEventListener('message', listener);
      },
    },
  };
};
