import { Effect, Layer, Schema } from 'effect';
import { Actor, Command } from 'effect-oak';
import { Scores } from './scores.js';

/** The Command a Scorer asks for on Score: a Request to the Board through Scores. */
const report = Command.make('report', {
  args: Schema.Struct({ name: Schema.String }),
  run: ({ name }) =>
    Effect.gen(function* () {
      yield* (yield* Scores).add(name);
    }),
});

/**
 * A Scorer Requires Scores from above. It never knows the Board is the one
 * that Provides it: the Request goes through the Capability.
 */
export const Scorer = Actor.make('Scorer', {
  requires: [Scores],
  input: Schema.Struct({ name: Schema.String }),
  model: Schema.Struct({ name: Schema.String, scored: Schema.Number }),
  message: Schema.TaggedUnion({ Score: {} }),
}).build({
  init: ({ name }) => ({ model: { name, scored: 0 } }),
  on: {
    Score: (_, { model }) => ({
      model: { ...model, scored: model.scored + 1 },
      command: report({ name: model.name }),
    }),
  },
});

/** At most this many Scorers on the Board. */
export const MOST_PLAYERS = 6;

/**
 * The Board Provides Scores and Invokes one Scorer per player, keyed by name.
 * Scored is the Message a Request makes; its Source is the Scorer's Command.
 */
export const Board = Actor.make('Board', {
  model: Schema.Struct({
    players: Schema.Array(Schema.String),
    next: Schema.Number,
    total: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    AddPlayer: {},
    RemoveLast: {},
    Scored: { name: Schema.String },
  }),
}).build({
  init: () => ({ model: { players: ['P-1'], next: 2, total: 0 } }),
  children: { players: Actor.many(Scorer) },
  provides: (self) =>
    Layer.succeed(Scores, {
      total: self.get.pipe(Effect.map(({ model }) => model.total)),
      add: (name) => self.send({ _tag: 'Scored', name }),
    }),
  invoke: ({ model }) => ({
    players: model.players.map((name) => ({ key: name, input: { name } })),
  }),
  on: {
    AddPlayer: (_, { model }) =>
      model.players.length < MOST_PLAYERS
        ? {
            model: {
              ...model,
              players: [...model.players, `P-${model.next}`],
              next: model.next + 1,
            },
          }
        : {},
    RemoveLast: (_, { model }) => ({
      model: { ...model, players: model.players.slice(0, -1) },
    }),
    Scored: (_, { model }) => ({
      model: { ...model, total: model.total + 1 },
    }),
  },
});
