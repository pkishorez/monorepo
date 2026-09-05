import type { Connectivity } from '../../domain/connectivity/index.js';

type NetworkHost = {
  navigator?: { onLine?: boolean };
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

export const connectivity = (): Connectivity | null => {
  const host = globalThis as NetworkHost;
  if (typeof host.navigator?.onLine !== 'boolean') return null;
  return {
    isOnline: () => host.navigator?.onLine !== false,
    subscribe: (listener) => {
      host.addEventListener?.('online', listener);
      host.addEventListener?.('offline', listener);
      return () => {
        host.removeEventListener?.('online', listener);
        host.removeEventListener?.('offline', listener);
      };
    },
  };
};
