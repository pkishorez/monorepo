import { Effect, Stream } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { StateStoreError } from '../../../../shared/contracts/state-stores/index.ts';
import {
  StoreDetailsError,
  isAlchemyManagedStack,
  type storeTarget,
  type stackTarget,
  type readStageTarget,
} from '../../../../shared/contracts/state-address/index.ts';
import type { resourceTarget } from '../../../../shared/contracts/resource-browser/index.ts';
import type { stageTarget } from '../../../../shared/contracts/delete-stage/index.ts';
import { alchemyStateStoreEntity } from '../../../storage/state-store-database/index.ts';
import * as management from '../store-management/index.ts';
import * as browser from '../state-browser/index.ts';
import * as resources from '../resource-browser/index.ts';
import * as outputs from '../stage-outputs/index.ts';
import * as deletionPreview from '../stage-deletion-preview/index.ts';
import * as deletion from '../stage-deletion/index.ts';
import { authorizeDeletion } from './authorize-deletion.ts';
import { read, removeStack } from '../../../services/alchemy-state/index.ts';

const manage = <A, E extends Parameters<typeof management.errorCode>[0], R>(
  run: (userId: string) => Effect.Effect<A, E, R>,
) =>
  Effect.flatMap(Authz.CurrentAuth, ({ user }) => run(user.id)).pipe(
    Effect.mapError(
      (error) =>
        new StateStoreError({
          code: management.errorCode(error),
          ...(error._tag === 'CloudflareDiscoveryError'
            ? { reason: error.reason }
            : {}),
        }),
    ),
  );

export const create = (input: Parameters<typeof management.create>[1]) =>
  manage((userId) => management.create(userId, input));
export const list = () => manage(management.list);
export const rename = (input: Parameters<typeof management.rename>[1]) =>
  manage((userId) => management.rename(userId, input));
export const remove = (input: Parameters<typeof management.remove>[1]) =>
  manage((userId) => management.remove(userId, input));
export const updateCredentials = (
  input: Parameters<typeof management.updateCredentials>[1],
) => manage((userId) => management.updateCredentials(userId, input));

const readStore = <A, R>(
  input: typeof storeTarget.Type,
  message: string,
  run: (
    connection: Parameters<typeof browser.listStacks>[0],
  ) => Effect.Effect<A, StoreDetailsError, R>,
) =>
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
    const data = yield* run(store.value.connection);
    yield* Effect.logInfo(message);
    return { storeName: store.value.name, data };
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError('Could not load state details', {
        code: error.code,
        ...(error.reason ? { reason: error.reason } : {}),
      }),
    ),
    Effect.withSpan('StoreOperations.read'),
  );

export const listStacks = (input: typeof storeTarget.Type) =>
  readStore(input, 'Listed stacks', browser.listStacks);
export const listStages = (input: typeof stackTarget.Type) =>
  readStore(input, 'Listed stages', (connection) =>
    browser.listStages(connection, input.stack),
  );
export const listResources = (input: typeof readStageTarget.Type) =>
  readStore(input, 'Listed resources', (connection) =>
    browser.listResources(connection, input.stack, input.stage),
  );
export const getStageView = (input: typeof readStageTarget.Type) =>
  readStore(input, 'Fetched stage view', (connection) =>
    Effect.all(
      {
        resources: resources.listSummaries(connection, input),
        outputs: outputs.getOutputs(connection, input),
      },
      { concurrency: 'unbounded' },
    ),
  );
export const getResourceState = (input: typeof resourceTarget.Type) =>
  readStore(input, 'Fetched resource state', (connection) =>
    resources.getState(connection, input),
  );

export const deleteStack = (input: typeof stackTarget.Type) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    const store = yield* alchemyStateStoreEntity
      .get({ userId: user.id, id: input.storeId }, { excludeDeleted: true })
      .pipe(
        Effect.mapError(
          () => new StateStoreError({ code: 'storage-error' as const }),
        ),
      );
    if (!store)
      return yield* Effect.fail(new StateStoreError({ code: 'not-found' }));
    if (isAlchemyManagedStack(input.stack))
      return yield* Effect.fail(
        new StateStoreError({
          code: 'managed-stack',
          reason:
            'Alchemy-managed state infrastructure cannot be removed here.',
        }),
      );
    const stages = yield* read(store.value.connection, {
      kind: 'stages',
      stack: input.stack,
    }).pipe(
      Effect.mapError(
        () =>
          new StateStoreError({
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
        new StateStoreError({
          code: 'remote-error',
          reason: 'The state store returned an invalid stage list.',
        }),
      );
    if (stages.length > 0)
      return yield* Effect.fail(
        new StateStoreError({
          code: 'non-empty',
          reason: 'Only stacks without deployed stages can be removed.',
        }),
      );
    yield* removeStack(store.value.connection, input.stack).pipe(
      Effect.mapError(
        () =>
          new StateStoreError({
            code: 'remote-error',
            reason: 'Could not remove the empty stack from its state store.',
          }),
      ),
    );
    yield* Effect.logInfo('Deleted empty stack');
  }).pipe(Effect.withSpan('StoreOperations.deleteStack'));

export const preview = (input: typeof stageTarget.Type) =>
  Stream.unwrap(
    authorizeDeletion(input, { kind: 'preview' }).pipe(
      Effect.map(deletionPreview.preview),
      Effect.withSpan('DeleteStage.preview'),
    ),
  );
export const destroy = (
  input: typeof stageTarget.Type & {
    fingerprint: string;
    acknowledgement?: string | undefined;
  },
) =>
  Stream.unwrap(
    authorizeDeletion(input, {
      kind: 'delete',
      acknowledgement: input.acknowledgement,
    }).pipe(
      Effect.map((target) =>
        deletion.destroy({ ...target, fingerprint: input.fingerprint }),
      ),
    ),
  );
