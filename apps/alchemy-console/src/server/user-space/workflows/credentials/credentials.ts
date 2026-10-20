import { Effect, Stream } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import {
  CredentialError,
  type CredentialSummary,
  inputProblem,
  nameProblem,
  type NewCredential,
  type Provider,
} from '../../../../shared/contracts/credential/index.ts';
import { Providers } from '../../services/providers/index.ts';
import { Storage } from '../../services/storage/index.ts';
import { Vault } from '../../services/vault/index.ts';
import { projectsUsing } from './in-use.ts';
import { envOf, secretOf } from './secret.ts';

/*
 * The Credentials group's handlers, and the one way a run reads a secret.
 *
 * - add     checks the input, asks the provider which account the keys
 *           belong to, seals them in the Vault, and keeps the credential;
 * - rename  changes only its name;
 * - remove  erases it, sealed secret and all, unless a project deploys
 *           with it;
 * - list    every credential, now and after each change, never a secret;
 * - envFor  the provider environment a run gets: the only place a sealed
 *           secret is opened.
 */

type Stored = Effect.Success<Storage['Service']['credentials']['all']>[number];

/** What the browser may see of a stored credential: everything but the sealed secret. */
const summaryOf = ({
  sealed: _sealed,
  ...summary
}: Stored): CredentialSummary => summary;

const notFound = new CredentialError({
  reason: 'not-found',
  field: null,
  message: 'That credential no longer exists.',
});

const invalid = (field: 'name', message: string) =>
  new CredentialError({ reason: 'invalid', field, message });

/** Fails when another credential of `provider` is already called `name`. */
const uniqueName = (
  storage: Storage['Service'],
  provider: Provider,
  name: string,
  except: string | null,
) =>
  Effect.gen(function* () {
    const taken = (yield* storage.credentials.all).some(
      (other) =>
        other.provider === provider &&
        other.credentialId !== except &&
        other.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken)
      return yield* invalid(
        'name',
        `You already have a credential called “${name}”.`,
      );
  });

/** The handlers, for the composition root to serve under `ConsoleApi`. */
export const credentialsHandlers = Effect.gen(function* () {
  const storage = yield* Storage;
  const vault = yield* Vault;
  const providers = yield* Providers;
  return {
    'Credentials.list': () =>
      storage.credentials.changes.pipe(Stream.map((all) => all.map(summaryOf))),
    'Credentials.add': (input: NewCredential) =>
      Effect.gen(function* () {
        const problem = inputProblem(input);
        if (problem !== null)
          return yield* new CredentialError({ reason: 'invalid', ...problem });
        const name = input.name.trim();
        // Checked before asking the provider, to answer at once, and again
        // with the write, since another tab may have taken it meanwhile.
        yield* uniqueName(storage, input.provider, name, null);
        const confirmed = yield* providers.verify(input);
        const sealed = yield* vault.encrypt(secretOf(input));
        const credentialId = yield* nextUlid;
        const saved = yield* storage.credentials.exclusively(
          Effect.gen(function* () {
            yield* uniqueName(storage, input.provider, name, null);
            const now = Date.now();
            return yield* storage.credentials.insert({
              credentialId,
              name,
              provider: input.provider,
              ...confirmed,
              sealed,
              createdAt: now,
              updatedAt: now,
            });
          }),
        );
        return summaryOf(saved);
      }),
    'Credentials.rename': ({
      credentialId,
      name,
    }: {
      readonly credentialId: string;
      readonly name: string;
    }) =>
      Effect.gen(function* () {
        const problem = nameProblem(name);
        if (problem !== null) return yield* invalid('name', problem);
        return yield* storage.credentials.exclusively(
          Effect.gen(function* () {
            const existing = yield* storage.credentials.get(credentialId);
            if (existing === null) return yield* notFound;
            yield* uniqueName(
              storage,
              existing.provider,
              name.trim(),
              credentialId,
            );
            const renamed = yield* storage.credentials.rename(
              credentialId,
              name.trim(),
              Date.now(),
            );
            if (renamed === null) return yield* notFound;
            return summaryOf(renamed);
          }),
        );
      }),
    'Credentials.remove': ({
      credentialId,
    }: {
      readonly credentialId: string;
    }) =>
      // Under the lock projects are made under, so none is made with it
      // between the check and the removal.
      storage.projects.exclusively(
        Effect.gen(function* () {
          const using = yield* projectsUsing(storage, credentialId);
          if (using.length > 0)
            return yield* new CredentialError({
              reason: 'in-use',
              field: null,
              message: `${using.map((name) => `“${name}”`).join(', ')} ${using.length === 1 ? 'deploys' : 'deploy'} with it. Pick another credential there first.`,
            });
          if (!(yield* storage.credentials.remove(credentialId)))
            return yield* notFound;
        }),
      ),
  };
});

/** The provider environment a run with `credentialId` gets: `CLOUDFLARE_*` or `AWS_*`. */
export const envFor = (credentialId: string) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const vault = yield* Vault;
    const stored = yield* storage.credentials.get(credentialId);
    if (stored === null) return yield* notFound;
    return envOf(
      stored.provider,
      yield* vault.decrypt(stored.sealed),
      stored.region,
    );
  });
