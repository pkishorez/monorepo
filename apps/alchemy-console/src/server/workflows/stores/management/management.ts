import { Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { DatabaseError } from 'std-toolkit/db';
import {
  StoreError,
  type createStoreInput,
  type updateStoreInput,
} from '../../../../shared/contracts/stores/index.ts';
import type { ProviderFailure } from '../../../../shared/contracts/credentials/index.ts';
import {
  storeEntity as stores,
  type storeSchema,
} from '../../../storage/stores/index.ts';
import { credentialEntity as credentials } from '../../../storage/credentials/index.ts';
import { locateStateStore } from 'alchemy-console/providers';

// Explicit projection keeps the state token out of every response.
export const view = (store: typeof storeSchema.Type) => ({
  id: store.id,
  userId: store.userId,
  name: store.name,
  state: {
    provider: store.state.provider,
    credentialId: store.state.credentialId,
  },
  grants: store.grants,
  createdAt: store.createdAt,
  updatedAt: store.updatedAt,
});

const ownedCredentials = (userId: string, ids: readonly string[]) =>
  Effect.forEach([...new Set(ids)], (id) =>
    credentials
      .get({ userId, id }, { excludeDeleted: true })
      .pipe(Effect.map((credential) => credential?.value ?? null)),
  ).pipe(
    Effect.map((items) =>
      items.filter((item): item is NonNullable<typeof item> => item !== null),
    ),
  );

export const create = (userId: string, input: typeof createStoreInput.Type) =>
  Effect.gen(function* () {
    const locating = yield* credentials.get(
      { userId, id: input.stateCredentialId },
      { excludeDeleted: true },
    );
    if (!locating || locating.value.secret.provider !== 'cloudflare')
      return yield* Effect.fail(
        new StoreError({
          code: 'credential-missing',
          reason:
            'Choose a Cloudflare credential for the account that hosts this state.',
        }),
      );
    const resolved = yield* locateStateStore(locating.value.secret);
    const grants = grantable(yield* ownedCredentials(userId, input.grants));
    const now = new Date().toISOString();
    const saved = yield* stores.insert({
      id: yield* nextUlid,
      userId,
      name: input.name.trim(),
      state: {
        provider: 'cloudflare',
        credentialId: input.stateCredentialId,
        ...resolved,
      },
      grants,
      createdAt: now,
      updatedAt: now,
    });
    yield* Effect.logInfo('Created store');
    return view(saved.value);
  }).pipe(Effect.withSpan('Stores.create'));

export const list = (userId: string) =>
  Effect.gen(function* () {
    const result: ReturnType<typeof view>[] = [];
    let afterId: string | null = null;
    while (true) {
      const page: Effect.Success<ReturnType<typeof stores.query>> =
        yield* stores.query(
          'primary',
          {
            pk: { userId },
            '>': afterId === null ? null : { id: afterId },
          },
          { limit: 100, excludeDeleted: true },
        );
      result.push(...page.items.map((item) => view(item.value)));
      const last = page.items.at(-1);
      if (!page.hasMore || !last) break;
      afterId = last.value.id;
    }
    yield* Effect.logInfo('Listed stores');
    return result;
  }).pipe(Effect.withSpan('Stores.list'));

// The state credential already covers Cloudflare resources, so grants only add
// other providers.
const grantable = (
  credentials: ReadonlyArray<{ id: string; secret: { provider: string } }>,
) =>
  credentials
    .filter((credential) => credential.secret.provider !== 'cloudflare')
    .map((credential) => credential.id);

export const update = (userId: string, input: typeof updateStoreInput.Type) =>
  Effect.gen(function* () {
    const key = { userId, id: input.id };
    const existing = yield* stores.get(key, { excludeDeleted: true });
    if (!existing)
      return yield* Effect.fail(new StoreError({ code: 'not-found' }));
    const grants = grantable(yield* ownedCredentials(userId, input.grants));
    const saved = yield* stores.getAndUpdate(key, {
      name: input.name.trim(),
      grants,
      updatedAt: new Date().toISOString(),
    });
    yield* Effect.logInfo('Updated store');
    return view(saved.value);
  }).pipe(Effect.withSpan('Stores.update'));

export const remove = (userId: string, input: { id: string }) =>
  Effect.gen(function* () {
    // Remove the state token too, rather than retaining it in a soft-deleted row.
    yield* stores.hardDelete(
      { userId, id: input.id },
      'I KNOW WHAT I AM DOING',
    );
    yield* Effect.logInfo('Deleted store');
  }).pipe(Effect.withSpan('Stores.remove'));

// Database failures may carry submitted values; expose only a safe error code.
export const errorOf = (error: DatabaseError | ProviderFailure | StoreError) =>
  error._tag === 'StoreError'
    ? error
    : error._tag === 'ProviderFailure'
      ? new StoreError({
          code:
            error.code === 'permission'
              ? 'cloudflare-permission'
              : error.code === 'not-found'
                ? 'state-store-missing'
                : 'discovery-failed',
          reason: error.reason,
        })
      : new StoreError({
          code:
            error.reason._tag === 'NoItemToUpdate'
              ? 'not-found'
              : 'storage-error',
        });
