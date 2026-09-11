import { Effect } from 'effect';
import { storeEntity as stores } from '../../../storage/stores/index.ts';
import { credentialEntity as credentials } from '../../../storage/credentials/index.ts';
import type { Credential } from 'alchemy-console/providers';

/** The store row for one user, or null when it does not exist or belongs to someone else. */
export const loadStore = (userId: string, storeId: string) =>
  stores
    .get({ userId, id: storeId }, { excludeDeleted: true })
    .pipe(Effect.map((store) => store?.value ?? null));

/** The store plus every credential it may use, secrets included, for deletion. */
export const loadDeletionAccess = (userId: string, storeId: string) =>
  Effect.gen(function* () {
    const store = yield* loadStore(userId, storeId);
    if (!store) return null;
    const ids = [...new Set([store.state.credentialId, ...store.grants])];
    const available: Credential[] = [];
    for (const id of ids) {
      const credential = yield* credentials.get(
        { userId, id },
        { excludeDeleted: true },
      );
      if (credential)
        available.push({
          id: credential.value.id,
          name: credential.value.name,
          account: credential.value.account,
          secret: credential.value.secret,
        });
    }
    return {
      store,
      state: { url: store.state.url, authToken: store.state.authToken },
      stateCredentialId: store.state.credentialId,
      available,
    };
  });
