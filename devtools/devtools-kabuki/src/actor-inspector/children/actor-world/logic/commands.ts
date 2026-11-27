import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';

export const control = Command.make('control', {
  args: Schema.Struct({
    fake: Schema.String,
    control: Schema.String,
    payload: Schema.Unknown,
  }),
  run: ({ fake, control, payload }) =>
    Effect.flatMap(KabukiSession, (session) =>
      session.control({ fake, control, payload }),
    ).pipe(
      Effect.matchEffect({
        onSuccess: () => Effect.void,
        onFailure: (error) =>
          Effect.succeed({
            _tag: 'Refused' as const,
            fake,
            control,
            reason:
              error._tag === 'ControlRefused'
                ? error.reason
                : 'The Kabuki Session did not answer',
          }),
      }),
    ),
});
