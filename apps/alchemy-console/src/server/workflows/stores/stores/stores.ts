import { Effect, Stream } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { StoreError } from '../../../../shared/contracts/stores/index.ts';
import {
  BrowseError,
  isAlchemyManagedStack,
  type storeTarget,
  type stackTarget,
  type stageTarget,
} from '../../../../shared/contracts/targets/index.ts';
import type { resourceTarget } from '../../../../shared/contracts/resources/index.ts';
import {
  DeletionError,
  type deletionOptions,
} from '../../../../shared/contracts/deletion/index.ts';
import { read, removeStack } from '../../../services/alchemy-state/index.ts';
import { loadDeletionAccess, loadStore } from '../access/index.ts';
import * as management from '../management/index.ts';
import * as explorer from '../explorer/index.ts';
import * as deletion from '../deletion/index.ts';

const manage = <A, E extends Parameters<typeof management.errorOf>[0], R>(
  run: (userId: string) => Effect.Effect<A, E, R>,
) =>
  Effect.flatMap(Authz.CurrentAuth, ({ user }) => run(user.id)).pipe(
    Effect.mapError(management.errorOf),
    Effect.tapError((error) =>
      Effect.logError('Store operation failed', {
        code: error.code,
        ...(error.reason ? { reason: error.reason } : {}),
      }),
    ),
  );

export const create = (input: Parameters<typeof management.create>[1]) =>
  manage((userId) => management.create(userId, input));
export const list = () => manage(management.list);
export const update = (input: Parameters<typeof management.update>[1]) =>
  manage((userId) => management.update(userId, input));
export const remove = (input: Parameters<typeof management.remove>[1]) =>
  manage((userId) => management.remove(userId, input));

const browse = <A, R>(
  input: typeof storeTarget.Type,
  message: string,
  run: (connection: {
    url: string;
    authToken: string;
  }) => Effect.Effect<A, BrowseError, R>,
) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    const store = yield* loadStore(user.id, input.storeId).pipe(
      Effect.mapError(() => new BrowseError({ code: 'storage-error' })),
    );
    if (!store)
      return yield* Effect.fail(new BrowseError({ code: 'not-found' }));
    yield* Effect.logInfo('Loaded store from database');
    const data = yield* run(store.state);
    yield* Effect.logInfo(message);
    return { storeName: store.name, data };
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError('Could not load state details', {
        code: error.code,
        ...(error.reason ? { reason: error.reason } : {}),
      }),
    ),
    Effect.withSpan('Stores.browse'),
  );

export const listStacks = (input: typeof storeTarget.Type) =>
  browse(input, 'Listed stacks', explorer.listStacks);
export const listStages = (input: typeof stackTarget.Type) =>
  browse(input, 'Listed stages', (connection) =>
    explorer.listStages(connection, input.stack),
  );
export const listResources = (input: typeof stageTarget.Type) =>
  browse(input, 'Listed resources', (connection) =>
    explorer.listResources(connection, input),
  );
export const getStageView = (input: typeof stageTarget.Type) =>
  browse(input, 'Fetched stage view', (connection) =>
    explorer.getStageView(connection, input),
  );
export const getResourceState = (input: typeof resourceTarget.Type) =>
  browse(input, 'Fetched resource state', (connection) =>
    explorer.getResourceState(connection, input),
  );

export const deleteStack = (input: typeof stackTarget.Type) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    const store = yield* loadStore(user.id, input.storeId).pipe(
      Effect.mapError(() => new StoreError({ code: 'storage-error' })),
    );
    if (!store)
      return yield* Effect.fail(new StoreError({ code: 'not-found' }));
    if (isAlchemyManagedStack(input.stack))
      return yield* Effect.fail(
        new StoreError({
          code: 'managed-stack',
          reason:
            'Alchemy-managed state infrastructure cannot be removed here.',
        }),
      );
    const stages = yield* read(store.state, {
      kind: 'stages',
      stack: input.stack,
    }).pipe(
      Effect.mapError(
        () =>
          new StoreError({
            code: 'remote-error',
            reason: 'Could not verify that the stack is empty.',
          }),
      ),
    );
    if (
      !Array.isArray(stages) ||
      !stages.every((stage) => typeof stage === 'string')
    )
      return yield* Effect.fail(
        new StoreError({
          code: 'remote-error',
          reason: 'The state store returned an invalid stage list.',
        }),
      );
    if (stages.length > 0)
      return yield* Effect.fail(
        new StoreError({
          code: 'non-empty',
          reason: 'Only stacks without deployed stages can be removed.',
        }),
      );
    yield* removeStack(store.state, input.stack).pipe(
      Effect.mapError(
        () =>
          new StoreError({
            code: 'remote-error',
            reason: 'Could not remove the empty stack from its state store.',
          }),
      ),
    );
    yield* Effect.logInfo('Deleted empty stack');
  }).pipe(Effect.withSpan('Stores.deleteStack'));

const deletionRequest = (
  input: typeof stageTarget.Type & typeof deletionOptions.Type,
  intent: Parameters<typeof deletion.authorize>[1],
) =>
  Effect.gen(function* () {
    yield* deletion.authorize(input, intent);
    const { user } = yield* Authz.CurrentAuth;
    const access = yield* loadDeletionAccess(user.id, input.storeId).pipe(
      Effect.mapError(
        () =>
          new DeletionError({
            code: 'storage-error',
            reason: 'Could not load the store and its credentials.',
          }),
      ),
    );
    if (!access)
      return yield* Effect.fail(
        new DeletionError({
          code: 'not-found',
          reason: 'This store is no longer available.',
        }),
      );
    return {
      stack: input.stack,
      stage: input.stage,
      forget: input.forget,
      credentials: input.credentials,
      state: access.state,
      stateCredentialId: access.stateCredentialId,
      available: access.available,
    };
  });

export const preview = (
  input: typeof stageTarget.Type & typeof deletionOptions.Type,
) =>
  Stream.unwrap(
    deletionRequest(input, { kind: 'preview' }).pipe(
      Effect.map(deletion.preview),
      Effect.withSpan('Deletion.preview'),
    ),
  );
export const destroy = (
  input: typeof stageTarget.Type &
    typeof deletionOptions.Type & {
      fingerprint: string;
      acknowledgement?: string | undefined;
    },
) =>
  Stream.unwrap(
    deletionRequest(input, {
      kind: 'delete',
      acknowledgement: input.acknowledgement,
    }).pipe(
      Effect.map((request) =>
        deletion.destroy({ ...request, fingerprint: input.fingerprint }),
      ),
    ),
  );
