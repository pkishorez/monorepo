import { type AppPlatform, createApp } from '@kstackz/auth-toolkit/app';
import {
  type DeviceSettings,
  openSettings,
  type Settings,
  settingsTable,
  useSettings as useStoredSettings,
} from './cache/settings/index.ts';
import { cloudLink, loadDeviceLink } from './link/index.ts';
import { ledgerSession } from './session/index.ts';

/**
 * Ledger on one platform, from web-toolkit's `webPlatform` or expo-toolkit's
 * `expoPlatform`: sign-in on the cloud or the device Backend, with the link
 * to the Backend and each user's Session opened and closed with it, and this
 * device's Settings, its cache. Nothing runs until a screen first asks, so
 * it can be made where the platform is not there yet, as on a web server.
 * Make one per app.
 */
export const createLedger = (platform: () => AppPlatform['Service']) => {
  const app = createApp({
    platform,
    cloud: cloudLink,
    // The device Backend's code is loaded only for those who choose it.
    device: loadDeviceLink,
    session: ledgerSession,
  });

  // The cache: Settings belong to this device, not to any user.
  let settingsOpened: DeviceSettings | undefined;
  const settings = () =>
    (settingsOpened ??= openSettings(
      app.platform().table(settingsTable, 'device'),
    ));

  return {
    ...app,
    /** This device's Settings, live, the defaults until any is changed, and
     * changing some of them. */
    useSettings: (): readonly [Settings, DeviceSettings['change']] => [
      useStoredSettings(settings()),
      settings().change,
    ],
  };
};

/** Ledger's client, as `createLedger` makes it. */
export type Ledger = ReturnType<typeof createLedger>;
