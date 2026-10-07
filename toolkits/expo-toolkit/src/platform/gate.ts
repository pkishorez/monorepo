import type { GatePlatform } from '@kstackz/auth-toolkit/gate';
import { makeLifecycle } from './lifecycle';

/**
 * The Gate on a phone, but for its table: the network from expo-network
 * and the foreground from AppState. One app, so no other tabs.
 */
export const expoGatePlatform = (): Omit<GatePlatform, 'table'> => ({
  lifecycle: makeLifecycle(),
});
