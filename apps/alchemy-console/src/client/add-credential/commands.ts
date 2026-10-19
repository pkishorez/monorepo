import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import type { CredentialField } from '../../shared/contracts/credential/index.ts';
import { Api } from '../../shared/pages/index.ts';
import { takeKeys } from './held-keys.ts';
import { AddCredentialOpener } from './opener.ts';

/*
 * The sheet's errands: each asks once, and ends in one Message. Only `add`
 * ever touches the keys, taken from where the form left them straight to
 * the User Space; its answer names the attempt it was for, so the sheet
 * can ignore one it has since closed.
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

/** Asks the User Space to verify and keep the credential held under `handle`. */
export const add = Command.make('add', {
  args: Schema.Struct({ handle: Schema.String, attempt: Schema.Number }),
  run: ({ handle, attempt }) =>
    Effect.gen(function* () {
      const input = takeKeys(handle);
      if (input === null)
        return {
          _tag: 'Refused' as const,
          attempt,
          problem: { field: null, message: 'Send the form again.' },
        };
      const api = yield* Api;
      const added = yield* api.call((client) =>
        client['Credentials.add'](input),
      );
      return {
        _tag: 'Added' as const,
        attempt,
        credentialId: added.credentialId,
      };
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'Refused' as const,
          attempt,
          problem: problemOf(error),
        }),
      ),
    ),
});

/** Lets go of keys the sheet will not send. */
export const drop = Command.make('drop', {
  args: Schema.Struct({ handle: Schema.String }),
  run: ({ handle }) => Effect.sync(() => void takeKeys(handle)),
});

/** Tells the opener the new credential's ID. */
export const announce = Command.make('announce', {
  args: Schema.Struct({ credentialId: Schema.String }),
  run: ({ credentialId }) =>
    Effect.flatMap(AddCredentialOpener, (opener) => opener.added(credentialId)),
});

/** Tells the opener the user closed the sheet. */
export const close = Command.make('close', {
  args: Schema.Struct({}),
  run: () => Effect.flatMap(AddCredentialOpener, (opener) => opener.closed),
});
