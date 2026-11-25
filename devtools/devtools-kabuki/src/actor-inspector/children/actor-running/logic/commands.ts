import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Step } from '../../../../server/rpc/session/contract/index.ts';
import { KabukiSession } from '../../../../services/kabuki-session/contract/index.ts';
import { problemOf } from './shared/index.ts';

const failed = (error: { readonly _tag: string }) =>
  Effect.succeed({ _tag: 'Failed' as const, problem: problemOf(error) });

export const travel = Command.make('travel', {
  args: Schema.Struct({ to: Schema.NullOr(Step) }),
  run: ({ to }) =>
    Effect.flatMap(KabukiSession, (session) => session.travel({ to })).pipe(
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
