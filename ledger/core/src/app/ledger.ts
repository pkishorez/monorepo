import { createApp, type Platform } from '@kstackz/auth-toolkit/client';
import { LedgerApi } from '../api/index.ts';
import {
  type DeviceSettings,
  openSettings,
  type Settings,
  settingsTable,
  useSettings as useStoredSettings,
} from './cache/settings/index.ts';
import { loadDevice } from './device/index.ts';
import { ledgerSession } from './session/index.ts';

/**
 * Ledger on one Platform, which each app builds: sign-in on the cloud or the
 * device Backend, with each user's Session opened and closed with it, and this
 * device's Settings, its cache. Nothing runs until a screen first asks, so
 * it can be made where the platform is not there yet, as on a web server.
 * Make one per app.
 */
export const createLedger = (platform: () => Platform) => {
  const app = createApp({
    platform,
    api: LedgerApi,
    // The device Backend's code is loaded only for those who choose it.
    device: loadDevice,
    session: ledgerSession,
  });

  // The cache: Settings belong to this device, not to any user.
  let settingsOpened: DeviceSettings | undefined;
  const settings = () =>
    (settingsOpened ??= openSettings(
      app.platform().storage.table(settingsTable, 'device'),
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
