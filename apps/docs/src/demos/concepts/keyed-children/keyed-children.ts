import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/*
 * A Player is a Counter that takes Input: its name, which its init copies
 * into its Model. From then on the Player owns it; the Scoreboard keeps
 * only the key.
 */
export const Player = Actor.make('Player', {
  input: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String, count: Schema.Number }),
  message: Schema.TaggedUnion({ Increment: {} }),
}).build({
  init: ({ name }) => ({ model: { name, count: 0 } }),
  on: {
    Increment: (_, { model }) => ({
      model: { ...model, count: model.count + 1 },
    }),
  },
});

/*
 * The Scoreboard Invokes one Player per name in its Model, keyed by that
 * name. The Model decides which Players exist: adding a name starts one,
 * removing it stops one, and `invoke` says what Input each starts from.
 */
export const Scoreboard = Actor.make('Scoreboard', {
  model: Schema.Struct({
    players: Schema.Array(Schema.String),
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({ AddPlayer: {}, RemoveLast: {} }),
}).build({
  init: () => ({ model: { players: ['P-1'], next: 2 } }),
  children: { players: Actor.many(Player) },
  invoke: ({ model }) => ({
    players: model.players.map((name) => ({ key: name, input: { name } })),
  }),
  on: {
    AddPlayer: (_, { model }) => ({
      model: {
        players: [...model.players, `P-${model.next}`],
        next: model.next + 1,
      },
    }),
    RemoveLast: (_, { model }) => ({
      model: { ...model, players: model.players.slice(0, -1) },
    }),
  },
});
