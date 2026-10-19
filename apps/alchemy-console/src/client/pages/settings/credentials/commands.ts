import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Api } from '../../../../shared/pages/index.ts';

/*
 * The Credentials section's errands, each one call to the User Space,
 * ending in one Message. What they change arrives on its own, through the
 * list the section follows.
 */

const done = { _tag: 'EditDone' as const };

const failed = (error: unknown) =>
  Effect.succeed({
    _tag: 'EditFailed' as const,
    message:
      (error as { readonly _tag?: unknown })._tag === 'CredentialError'
        ? (error as { readonly message: string }).message
        : 'Console couldn’t reach your data. Check your connection and try again.',
  });

export const rename = Command.make('rename', {
  args: Schema.Struct({ credentialId: Schema.String, name: Schema.String }),
  run: (args) =>
    Effect.gen(function* () {
      yield* (yield* Api).call((client) => client['Credentials.rename'](args));
      return done;
    }).pipe(Effect.catch(failed)),
});

export const remove = Command.make('remove', {
  args: Schema.Struct({ credentialId: Schema.String }),
  run: (args) =>
    Effect.gen(function* () {
      yield* (yield* Api).call((client) => client['Credentials.remove'](args));
      return done;
    }).pipe(Effect.catch(failed)),
});
