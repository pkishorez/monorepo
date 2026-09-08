import { Effect } from 'effect';
import { StateStores } from '../../../shared/rpc/state-stores/index.ts';
import { StateStoreError } from '../../../shared/contracts/state-stores/index.ts';
import * as operations from '../../workflows/state-stores/index.ts';

const safeError = Effect.mapError(
  (error: Parameters<typeof operations.errorCode>[0]) =>
    new StateStoreError({
      code: operations.errorCode(error),
      ...(error._tag === 'CloudflareDiscoveryError'
        ? { reason: error.reason }
        : {}),
    }),
);

export const StateStoreHandlers = StateStores.toLayer({
  'AlchemyStateStore.UpdateCredentials': (input) =>
    operations.updateCredentials(input).pipe(safeError),
  'AlchemyStateStore.Create': (input) =>
    operations.create(input).pipe(safeError),
  'AlchemyStateStore.List': () => operations.list().pipe(safeError),
  'AlchemyStateStore.Rename': (input) =>
    operations.rename(input).pipe(safeError),
  'AlchemyStateStore.Delete': (input) =>
    operations.remove(input).pipe(safeError),
});
