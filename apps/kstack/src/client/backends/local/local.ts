import { Effect, Layer } from 'effect';
import {
  authLocal,
  type LocalChoice,
  localAccountsTable,
} from '@kstackz/auth-toolkit/clients/auth';
import { IDB } from '@kstackz/std-toolkit/db/idb';
import { localConnection } from '../../../server/backends/local/index.ts';
import { Device, Sessions } from '../../domain/machine/index.ts';
import { openSessions } from '../../state/session/index.ts';
import { deviceDatabase } from '../../state/settings/index.ts';

// The Local Backend is always there, so nobody opens offline, and a
// Session's copy lives in memory, so there is none to delete.
const deviceLocal = Layer.succeed(Device, {
  lastUser: Effect.succeed(null),
  setLastUser: () => Effect.void,
  keepCopies: () => Effect.void,
});

/**
 * The Local Backend, as the app machine needs it: Users signed in by
 * choosing any name, kept in the device's database, and each Session over
 * an in-process connection to the Backend's own handlers. `choose` asks who
 * signs in.
 */
export const localBackend = (choose: Effect.Effect<LocalChoice | null>) =>
  Layer.mergeAll(
    authLocal({
      choose,
      storage: IDB.make(localAccountsTable, { database: deviceDatabase() })
        .layer,
    }),
    deviceLocal,
    Layer.succeed(Sessions, {
      open: openSessions({ connection: localConnection }),
    }),
  );
