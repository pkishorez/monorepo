import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { KabukiSession } from '../../../../../../services/kabuki-session/contract/index.ts';
import type { KabukiSessionCalls } from '../../../../../../services/kabuki-session/contract/index.ts';

const reasonOf = (
  error: Effect.Error<ReturnType<KabukiSessionCalls['send']>>,
) => {
  switch (error._tag) {
    case 'MessageRefused':
      return error.reason;
    case 'Seeking':
      return 'The app shows a past Step: go back to now to send';
    case 'InstanceNotFound':
      return 'It is no longer there';
    default:
      return 'The Kabuki Session did not answer';
  }
};

export const send = Command.make('send', {
  args: Schema.Struct({
    to: Schema.String,
    tag: Schema.String,
    message: Schema.Unknown,
  }),
  run: ({ to, tag, message }) =>
    Effect.flatMap(KabukiSession, (session) =>
      session.send({ to, message }),
    ).pipe(
      Effect.matchEffect({
        onSuccess: (said) =>
          Effect.succeed({ _tag: 'Answered' as const, tag, said }),
        onFailure: (error) =>
          Effect.succeed({
            _tag: 'Refused' as const,
            tag,
            said:
              error._tag === 'MessageRefused'
                ? ('refused' as const)
                : ('failed' as const),
            reason: reasonOf(error),
          }),
      }),
    ),
});
