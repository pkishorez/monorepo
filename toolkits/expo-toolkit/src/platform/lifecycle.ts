import { getLinkingURL } from 'expo-linking';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from 'expo-network';
import { AppState } from 'react-native';
import { type Backend, backendNamed } from '@kstackz/auth-toolkit/gate';

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

// A link that opened the app with `?backend=device` or `?backend=cloud` (or
// their former names) chooses the Backend, as the address does on the web:
// how an agent starts an app on the device Backend.
const launchBackend = (): Backend | null =>
  backendNamed(/[?&]backend=(\w+)/.exec(getLinkingURL() ?? '')?.[1]);
