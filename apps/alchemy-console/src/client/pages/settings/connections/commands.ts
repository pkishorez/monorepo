import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Api } from '../../../../shared/pages/index.ts';
import { goInstall } from '../../../connect-github/index.ts';

/*
 * The GitHub section's errands, each ending in one Message. What they
 * change arrives on its own, through the list the section follows; adding
 * one leaves for GitHub and comes back to Settings.
 */

export const add = Command.make('add', {
  run: () =>
    goInstall('/settings').pipe(
      Effect.andThen(Effect.never),
      Effect.catch(({ message }) =>
        Effect.succeed({ _tag: 'AddFailed' as const, message }),
      ),
    ),
});

export const remove = Command.make('remove', {
  args: Schema.Struct({ connectionId: Schema.String }),
  run: (args) =>
    Effect.gen(function* () {
      yield* (yield* Api).call((client) => client['Connections.remove'](args));
      return { _tag: 'RemoveDone' as const };
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'RemoveFailed' as const,
          message:
            (error as { readonly _tag?: unknown })._tag === 'GitHubError'
              ? (error as { readonly message: string }).message
              : 'Console couldn’t reach your data. Check your connection and try again.',
        }),
      ),
    ),
});
