import { Context, Schema } from 'effect';
import { Node } from 'effect-oak';
import { Round, Scores } from './round/index.js';

/*
 * The arcade: the high score, and the round being played.
 *
 * The round restarts itself as often as you like; the arcade outlives every
 * round and keeps the best score. A round reports its score through the
 * Scores Request when it ends.
 */

export const Arcade = Node.make('Arcade', {
  model: Schema.Struct({ highScore: Schema.Number }),
  message: Schema.TaggedUnion({ FinishedRound: { points: Schema.Number } }),
  provides: [Scores],
  children: { round: Round },
}).build({
  init: () => ({ model: { highScore: 0 } }),
  provides: ({ send }) =>
    Context.make(Scores, {
      finished: (points) => send({ _tag: 'FinishedRound', points }),
    }),
  update: {
    FinishedRound: ({ points }, { model }) =>
      points > model.highScore ? { model: { highScore: points } } : {},
  },
});
