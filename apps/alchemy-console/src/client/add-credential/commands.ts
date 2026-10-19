import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import {
  type CredentialField,
  NewCredential,
} from '../../shared/contracts/credential/index.ts';
import { Api } from '../../shared/pages/index.ts';
import { AddCredentialOpener } from './opener.ts';

/*
 * The sheet's errands: each asks once, and ends in one Message. Only `add`
 * ever carries the keys, from the form straight to the User Space.
 */

const problemOf = (error: unknown) => {
  const known = error as {
    readonly _tag?: unknown;
    readonly field?: CredentialField | null;
    readonly message?: string;
  };
  return known._tag === 'CredentialError'
    ? { field: known.field ?? null, message: known.message ?? '' }
    : {
        field: null,
        message:
          'Console couldn’t save it. Check your connection and try again.',
      };
};

/** Asks the User Space to verify and keep the credential, then tells the opener. */
export const add = Command.make('add', {
  args: Schema.Struct({ input: NewCredential }),
  run: ({ input }) =>
    Effect.gen(function* () {
      const api = yield* Api;
      const added = yield* api.call((client) =>
        client['Credentials.add'](input),
      );
      yield* (yield* AddCredentialOpener).added(added.credentialId);
      return { _tag: 'Added' as const };
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'Refused' as const,
          problem: problemOf(error),
        }),
      ),
    ),
});

/** Tells the opener the user closed the sheet. */
export const close = Command.make('close', {
  args: Schema.Struct({}),
  run: () => Effect.flatMap(AddCredentialOpener, (opener) => opener.closed),
});
