import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Step } from '../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../services/kabuki-session/contract/index.ts';

export const problemOf = (error: { readonly _tag: string }) =>
  error._tag === 'StepNotFound'
    ? 'This Step is no longer kept.'
    : 'The Kabuki Session did not answer.';

const failed = (error: { readonly _tag: string }) =>
  Effect.succeed({ _tag: 'Failed' as const, problem: problemOf(error) });

export const preview = Command.make('preview', {
  args: Schema.Struct({ at: Schema.NullOr(Step) }),
  run: ({ at }) =>
    Effect.flatMap(KabukiSession, (session) => session.preview({ at })).pipe(
      Effect.matchEffect({ onSuccess: () => Effect.void, onFailure: failed }),
    ),
});

export const fork = Command.make('fork', {
  args: Schema.Struct({ from: Step }),
  run: ({ from }) =>
    Effect.flatMap(KabukiSession, (session) => session.fork({ from })).pipe(
      Effect.matchEffect({ onSuccess: () => Effect.void, onFailure: failed }),
    ),
});
