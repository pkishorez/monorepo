import { Effect } from 'effect';
import { StateStores, StateStoreError } from '../state-stores/index.ts';
import * as operations from '../../operations/state-stores/index.ts';

const safeError = Effect.mapError(
  (error: Parameters<typeof operations.errorCode>[0]) =>
    new StateStoreError({ code: operations.errorCode(error) }),
);

export const StateStoreHandlers = StateStores.toLayer({
  'AlchemyStateStore.Create': (input) =>
    operations.create(input).pipe(safeError),
  'AlchemyStateStore.List': () => operations.list().pipe(safeError),
  'AlchemyStateStore.Rename': (input) =>
    operations.rename(input).pipe(safeError),
  'AlchemyStateStore.Delete': (input) =>
    operations.remove(input).pipe(safeError),
});
