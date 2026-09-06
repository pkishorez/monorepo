import { Effect } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { nextUlid } from 'std-toolkit/core';
import type { DatabaseError } from 'std-toolkit/db';
import {
  alchemyStateStoreEntity as stores,
  alchemyStateStoreSchema,
} from '../../../shared/contracts/alchemy-state-store/index.ts';

// Explicit projection keeps stored credentials out of every successful response.
const view = (store: typeof alchemyStateStoreSchema.Type) => ({
  id: store.id,
  userId: store.userId,
  name: store.name,
  connection: {
    kind: store.connection.kind,
    url: store.connection.url,
    authToken: 'xxxxxxxx' as const,
  },
  createdAt: store.createdAt,
  updatedAt: store.updatedAt,
});

export const create = (
  input: Pick<typeof alchemyStateStoreSchema.Type, 'name' | 'connection'>,
) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    const id = yield* nextUlid;
    const now = new Date().toISOString();

    const saved = yield* stores.insert({
      id,
      userId: user.id,
      name: input.name.trim(),
      connection: input.connection,
      createdAt: now,
      updatedAt: now,
    });
    return view(saved.value);
  });

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
    return result;
  });

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
    return view(saved.value);
  });

export const remove = (input: { id: string }) =>
  Effect.gen(function* () {
    const { user } = yield* Authz.CurrentAuth;
    // Remove the credential too, rather than retaining it in a soft-deleted row.
    yield* stores.hardDelete(
      { userId: user.id, id: input.id },
      'I KNOW WHAT I AM DOING',
    );
  });

// Database failures may carry submitted values; expose only a safe error code.
export const errorCode = (error: DatabaseError) =>
  error.reason._tag === 'NoItemToUpdate'
    ? ('not-found' as const)
    : ('storage-error' as const);
