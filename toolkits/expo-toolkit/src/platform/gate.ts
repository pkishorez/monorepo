import type { GatePlatform } from '@kstackz/auth-toolkit/gate';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { makeLifecycle } from './lifecycle';

/**
 * The Gate on a phone: what it remembers in the keychain (iOS) or Keystore
 * (Android) under `name`, the network from expo-network and the foreground
 * from AppState. One app, so no other tabs.
 */
export const expoGatePlatform = (name: string): GatePlatform => {
  // Secure storage takes only letters, digits, `.`, `-` and `_` in a key.
  const keyOf = (key: string) => `${name}.${key.replace(/[^\w.-]/g, '.')}`;
  return {
    memory: {
      get: async (key) => {
        try {
          return await getItemAsync(keyOf(key));
        } catch {
          return null;
        }
      },
      set: async (key, value) => {
        try {
          await (value === null
            ? deleteItemAsync(keyOf(key))
            : setItemAsync(keyOf(key), value));
        } catch {
          // Not remembered: the Gate asks the Backend next launch.
        }
      },
    },
    lifecycle: makeLifecycle(),
  };
};
