import { getLinkingURL } from 'expo-linking';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from 'expo-network';
import { AppState } from 'react-native';
import type { Backend } from '@ledger/core/client/settings';

/**
 * When the app is online and in view: the network from expo-network, the
 * foreground from AppState. Online until the network says otherwise, so a
 * launch never starts offline while the first answer is on its way.
 */
export const makeLifecycle = () => {
  let online = true;
  const listeners = new Set<() => void>();
  const take = (state: NetworkState) => {
    const now = state.isConnected !== false;
    if (now === online) return;
    online = now;
    listeners.forEach((changed) => changed());
  };
  void getNetworkStateAsync().then(take, () => {});
  addNetworkStateListener(take);

  return {
    online: () => online,
    onOnlineChange: (changed: () => void) => {
      listeners.add(changed);
      return () => void listeners.delete(changed);
    },
    onForeground: (shown: () => void) => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') shown();
      });
      return () => subscription.remove();
    },
    launchBackend,
  };
};

// A link that opened the app with `?backend=local` or `?backend=remote`
// chooses the Backend, as the address does on the web: how an agent starts
// Ledger on the Local Backend.
const launchBackend = (): Backend | null => {
  const asked = /[?&]backend=(local|remote)\b/.exec(getLinkingURL() ?? '');
  return (asked?.[1] as Backend | undefined) ?? null;
};
