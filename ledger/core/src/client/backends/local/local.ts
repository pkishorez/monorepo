import { Effect, Layer } from 'effect';
import {
  authLocal,
  type LocalChoice,
  localAccountsTable,
} from '@kstackz/auth-toolkit/clients/auth';
import { localConnection } from '../../../server/backends/local/index.ts';
import { ledgerTable } from '../../../server/domain/storage/index.ts';
import { Device, Sessions } from '../../domain/machine/index.ts';
import { LedgerPlatform } from '../../platform/index.ts';
import { openSessions } from '../../state/session/index.ts';

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
 * an in-process connection to the Backend's own handlers, on a database of
 * its own. `choose` asks who signs in.
 */
export const localBackend = (choose: Effect.Effect<LocalChoice | null>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const { storage } = yield* LedgerPlatform;
      return Layer.mergeAll(
        authLocal({
          choose,
          storage: storage.table(localAccountsTable, 'device'),
        }),
        deviceLocal,
        Layer.succeed(Sessions, {
          open: openSessions({
            connection: localConnection(
              storage.table(ledgerTable, 'local-backend'),
            ),
          }),
        }),
      );
    }),
  );
