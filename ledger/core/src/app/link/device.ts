import { Effect, Layer } from 'effect';
import { AppPlatform } from '@kstackz/auth-toolkit/app';
import { layerInProcessProtocol } from '@kstackz/rpc-toolkit/rpc/in-process';
import { LedgerApi } from '../../api/index.ts';
import { ledgerBackend } from '../../backend/backend.ts';
import { authDevice } from '../../backend/services/auth/device.ts';
import { tableDevice } from '../../backend/services/table/device.ts';
import { memory } from '@kstackz/std-toolkit/sync';
import { BackendLink } from './link.ts';

/**
 * The link to the device Backend: the Backend itself, run in this process
 * on the device's own table, for whoever a Local Token names, so nothing
 * reaches a server. A session's Std Sync runs in memory: the device
 * Backend's table already keeps everything on this device.
 */
export const deviceLink = Layer.effect(
  BackendLink,
  Effect.map(AppPlatform, (platform) => ({
    api: layerInProcessProtocol(LedgerApi).pipe(
      Layer.provide(
        ledgerBackend.pipe(
          Layer.provide([
            tableDevice.pipe(
              Layer.provide(Layer.succeed(AppPlatform, platform)),
            ),
            authDevice,
          ]),
        ),
      ),
    ),
    syncPlatform: memory(),
  })),
);
