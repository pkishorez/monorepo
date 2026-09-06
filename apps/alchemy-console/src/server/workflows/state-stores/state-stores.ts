import { Effect } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import {
  discover,
  CloudflareDiscoveryError,
} from '../../services/cloudflare-discovery/index.ts';
import { nextUlid } from 'std-toolkit/core';
import type { DatabaseError } from 'std-toolkit/db';
import {
  alchemyStateStoreEntity as stores,
  alchemyStateStoreSchema,
} from '../../storage/state-store-database/index.ts';

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

export const create = (input: {
  name: string;
  connection: { kind: 'cloudflare'; accountId: string; apiToken: string };
}) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    const resolved = yield* discover(input.connection);
    const id = yield* nextUlid;
    const now = new Date().toISOString();

    const saved = yield* stores.insert({
      id,
      userId: user.id,
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

export const list = () =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    const result: ReturnType<typeof view>[] = [];
    let afterId: string | null = null;

    while (true) {
      const page: Effect.Success<ReturnType<typeof stores.query>> =
        yield* stores.query(
          'primary',
          {
            pk: { userId: user.id },
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

export const rename = (input: { id: string; name: string }) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    const saved = yield* stores.getAndUpdate(
      { userId: user.id, id: input.id },
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

export const remove = (input: { id: string }) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    // Remove the credential too, rather than retaining it in a soft-deleted row.
    yield* stores.hardDelete(
      { userId: user.id, id: input.id },
      'I KNOW WHAT I AM DOING',
    );
    yield* Effect.logInfo('Deleted state store');
  }).pipe(
    Effect.tapError((error) =>
      logFailure('Could not delete state store', error),
    ),
    Effect.withSpan('StateStores.remove'),
  );

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
