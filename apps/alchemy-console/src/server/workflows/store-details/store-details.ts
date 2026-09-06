import { Effect } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { alchemyStateStoreEntity } from '../../storage/state-store-database/index.ts';
import { StoreDetailsError } from '../../../shared/contracts/store-details/index.ts';
import { read, type StateRequest } from '../../services/alchemy-state/index.ts';

export const getDetails = (input: { storeId: string }, request: StateRequest) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    const store = yield* alchemyStateStoreEntity
      .get({ userId: user.id, id: input.storeId }, { excludeDeleted: true })
      .pipe(
        Effect.mapError(() => new StoreDetailsError({ code: 'storage-error' })),
      );
    if (!store)
      return yield* Effect.fail(new StoreDetailsError({ code: 'not-found' }));

    yield* Effect.logInfo('Loaded state store from database');

    const data = yield* read(store.value.connection, request);
    yield* Effect.logInfo(
      {
        stacks: 'Listed stacks',
        stages: 'Listed stages',
        resources: 'Listed resources',
        outputs: 'Fetched stage outputs',
        resource: 'Fetched resource state',
      }[request.kind],
    );
    return { storeName: store.value.name, data };
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError('Could not load state details', {
        code: error.code,
        ...(error.reason ? { reason: error.reason } : {}),
      }),
    ),
    Effect.withSpan(`StoreDetails.${request.kind}`),
  );
