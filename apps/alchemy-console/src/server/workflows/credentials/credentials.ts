import { Effect } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { nextUlid } from 'std-toolkit/core';
import type { DatabaseError } from 'std-toolkit/db';
import {
  CredentialError,
  ProviderFailure,
  type createCredentialInput,
  type updateCredentialInput,
} from '../../../shared/contracts/credentials/index.ts';
import {
  credentialEntity as credentials,
  type credentialSchema,
} from '../../storage/credentials/index.ts';
import { storeEntity as stores } from '../../storage/stores/index.ts';
import { verify } from 'alchemy-console/providers';

// Explicit projection keeps stored secrets out of every response.
const view = (credential: typeof credentialSchema.Type) => ({
  id: credential.id,
  userId: credential.userId,
  name: credential.name,
  provider: credential.secret.provider,
  account: credential.account,
  createdAt: credential.createdAt,
  updatedAt: credential.updatedAt,
});

const errorOf = (error: DatabaseError | ProviderFailure | CredentialError) =>
  error._tag === 'CredentialError'
    ? error
    : error._tag === 'ProviderFailure'
      ? new CredentialError({
          code: 'verification-failed',
          reason: error.reason,
        })
      : new CredentialError({
          code:
            error.reason._tag === 'NoItemToUpdate'
              ? 'not-found'
              : 'storage-error',
        });

const run = <A, R>(
  name: string,
  operation: (
    userId: string,
  ) => Effect.Effect<A, DatabaseError | ProviderFailure | CredentialError, R>,
) =>
  Effect.flatMap(Authz.CurrentAuth, ({ user }) => operation(user.id)).pipe(
    Effect.mapError(errorOf),
    Effect.tapError((error) =>
      Effect.logError(`Could not ${name} credential`, {
        code: error.code,
        ...(error.reason ? { reason: error.reason } : {}),
      }),
    ),
    Effect.withSpan(`Credentials.${name}`),
  );

const listAll = (userId: string) =>
  Effect.gen(function* () {
    const result: (typeof credentialSchema.Type)[] = [];
    let afterId: string | null = null;
    while (true) {
      const page: Effect.Success<ReturnType<typeof credentials.query>> =
        yield* credentials.query(
          'primary',
          { pk: { userId }, '>': afterId === null ? null : { id: afterId } },
          { limit: 100, excludeDeleted: true },
        );
      result.push(...page.items.map((item) => item.value));
      const last = page.items.at(-1);
      if (!page.hasMore || !last) break;
      afterId = last.value.id;
    }
    return result;
  });

const storesUsing = (userId: string, credentialId: string) =>
  Effect.gen(function* () {
    const names: string[] = [];
    let afterId: string | null = null;
    while (true) {
      const page: Effect.Success<ReturnType<typeof stores.query>> =
        yield* stores.query(
          'primary',
          { pk: { userId }, '>': afterId === null ? null : { id: afterId } },
          { limit: 100, excludeDeleted: true },
        );
      for (const { value } of page.items)
        if (
          value.state.credentialId === credentialId ||
          value.grants.includes(credentialId)
        )
          names.push(value.name);
      const last = page.items.at(-1);
      if (!page.hasMore || !last) break;
      afterId = last.value.id;
    }
    return names;
  });

export const create = (input: typeof createCredentialInput.Type) =>
  run('create', (userId) =>
    Effect.gen(function* () {
      const { account } = yield* verify(input.secret);
      const now = new Date().toISOString();
      const saved = yield* credentials.insert({
        id: yield* nextUlid,
        userId,
        name: input.name.trim(),
        account,
        secret: input.secret,
        createdAt: now,
        updatedAt: now,
      });
      yield* Effect.logInfo('Created credential');
      return view(saved.value);
    }),
  );

export const list = () =>
  run('list', (userId) =>
    Effect.map(listAll(userId), (items) => items.map(view)),
  );

export const update = (input: typeof updateCredentialInput.Type) =>
  run('update', (userId) =>
    Effect.gen(function* () {
      const key = { userId, id: input.id };
      const existing = yield* credentials.get(key, { excludeDeleted: true });
      if (!existing)
        return yield* Effect.fail(new CredentialError({ code: 'not-found' }));
      if (
        input.secret &&
        input.secret.provider !== existing.value.secret.provider
      )
        return yield* Effect.fail(
          new CredentialError({
            code: 'verification-failed',
            reason: 'A credential keeps its provider. Add a new one instead.',
          }),
        );
      const verified = input.secret ? yield* verify(input.secret) : null;
      const saved = yield* credentials.getAndUpdate(key, {
        name: input.name.trim(),
        ...(input.secret && verified
          ? { secret: input.secret, account: verified.account }
          : {}),
        updatedAt: new Date().toISOString(),
      });
      yield* Effect.logInfo('Updated credential');
      return view(saved.value);
    }),
  );

export const remove = (input: { id: string }) =>
  run('remove', (userId) =>
    Effect.gen(function* () {
      const key = { userId, id: input.id };
      const existing = yield* credentials.get(key, { excludeDeleted: true });
      if (!existing)
        return yield* Effect.fail(new CredentialError({ code: 'not-found' }));
      const using = yield* storesUsing(userId, input.id);
      if (using.length)
        return yield* Effect.fail(
          new CredentialError({
            code: 'in-use',
            reason: `Used by ${using.map((name) => `“${name}”`).join(', ')}. Remove it from those stores first.`,
          }),
        );
      // Remove the secret outright rather than keeping it in a soft-deleted row.
      yield* credentials.hardDelete(key, 'I KNOW WHAT I AM DOING');
      yield* Effect.logInfo('Deleted credential');
    }),
  );
