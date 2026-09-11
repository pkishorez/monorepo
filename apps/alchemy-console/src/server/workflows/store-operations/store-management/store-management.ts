import { Effect } from 'effect';
import {
  discover,
  CloudflareDiscoveryError,
} from '../../../services/cloudflare-discovery/index.ts';
import { nextUlid } from 'std-toolkit/core';
import type { DatabaseError } from 'std-toolkit/db';
import {
  alchemyStateStoreEntity as stores,
  alchemyStateStoreSchema,
} from '../../../storage/state-store-database/index.ts';
import type { createStateStoreInput } from '../../../../shared/contracts/state-stores/index.ts';

// Explicit projection keeps stored credentials out of every successful response.
const view = (store: typeof alchemyStateStoreSchema.Type) => ({
  id: store.id,
  userId: store.userId,
  name: store.name,
  connection: {
    kind: store.connection.kind,
    accountId: store.connection.accountId,
    apiToken: store.connection.apiToken === null ? null : ('xxxxxxxx' as const),
    url: store.connection.url,
    authToken: 'xxxxxxxx' as const,
  },
  createdAt: store.createdAt,
  updatedAt: store.updatedAt,
});

export const create = (
  userId: string,
  input: typeof createStateStoreInput.Type,
) =>
  Effect.gen(function* () {
    const resolved = yield* discover(input.connection);
    const id = yield* nextUlid;
    const now = new Date().toISOString();

    const saved = yield* stores.insert({
      id,
      userId,
      name: input.name.trim(),
      connection: { ...input.connection, ...resolved },
      createdAt: now,
      updatedAt: now,
    });
    yield* Effect.logInfo('Created state store');
    return view(saved.value);
  }).pipe(
    Effect.tapError((error) =>
      logFailure('Could not create state store', error),
    ),
    Effect.withSpan('StateStores.create'),
  );

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
    yield* Effect.logInfo('Listed state stores');
    return result;
  }).pipe(
    Effect.tapError((error) =>
      logFailure('Could not list state stores', error),
    ),
    Effect.withSpan('StateStores.list'),
  );

export const rename = (userId: string, input: { id: string; name: string }) =>
  Effect.gen(function* () {
    const saved = yield* stores.getAndUpdate(
      { userId, id: input.id },
      {
        name: input.name.trim(),
        updatedAt: new Date().toISOString(),
      },
    );
    yield* Effect.logInfo('Renamed state store');
    return view(saved.value);
  }).pipe(
    Effect.tapError((error) =>
      logFailure('Could not rename state store', error),
    ),
    Effect.withSpan('StateStores.rename'),
  );

export const remove = (userId: string, input: { id: string }) =>
  Effect.gen(function* () {
    // Remove the credential too, rather than retaining it in a soft-deleted row.
    yield* stores.hardDelete(
      { userId, id: input.id },
      'I KNOW WHAT I AM DOING',
    );
    yield* Effect.logInfo('Deleted state store');
  }).pipe(
    Effect.tapError((error) =>
      logFailure('Could not delete state store', error),
    ),
    Effect.withSpan('StateStores.remove'),
  );

export const updateCredentials = (
  userId: string,
  input: {
    id: string;
    accountId: string;
    apiToken: string;
  },
) =>
  Effect.gen(function* () {
    const key = { userId, id: input.id };
    // Establish ownership before using the submitted credentials.
    const existing = yield* stores.get(key, { excludeDeleted: true });
    if (!existing) {
      return yield* Effect.fail(
        new CloudflareDiscoveryError({
          code: 'discovery-failed',
          reason: 'This store is no longer available.',
        }),
      );
    }
    const resolved = yield* discover(input);
    if (resolved.url !== existing.value.connection.url) {
      return yield* Effect.fail(
        new CloudflareDiscoveryError({
          code: 'discovery-failed',
          reason: 'The token must connect to the same state store.',
        }),
      );
    }
    const saved = yield* stores.getAndUpdate(key, {
      connection: {
        kind: 'cloudflare',
        accountId: input.accountId,
        apiToken: input.apiToken,
        ...resolved,
      },
      updatedAt: new Date().toISOString(),
    });
    return view(saved.value);
  }).pipe(Effect.withSpan('StateStores.updateCredentials'));

// Database failures may carry submitted values; expose only a safe error code.
export const errorCode = (error: DatabaseError | CloudflareDiscoveryError) =>
  error._tag === 'CloudflareDiscoveryError'
    ? error.code
    : error.reason._tag === 'NoItemToUpdate'
      ? ('not-found' as const)
      : ('storage-error' as const);

const logFailure = (
  message: string,
  error: DatabaseError | CloudflareDiscoveryError,
) =>
  Effect.logError(message, {
    code: errorCode(error),
    ...(error._tag === 'CloudflareDiscoveryError'
      ? { reason: error.reason }
      : {}),
  });
