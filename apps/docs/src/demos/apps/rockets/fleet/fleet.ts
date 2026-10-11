import { Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Rocket } from '../state/index.js';

export const Fleet = Actor.make('Fleet', {
  model: Schema.Struct({
    rockets: Schema.Array(Schema.String),
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({
    Build: {},
    Dismantle: { name: Schema.String },
  }),
  children: { rockets: Actor.many(Rocket) },
}).build({
  init: () => ({ model: { rockets: ['R-1'], next: 2 } }),
  invoke: ({ model }) => ({
    rockets: model.rockets.map((name) => ({ key: name })),
  }),
  update: {
    Build: (_, { model }) =>
      model.rockets.length < 20
        ? {
            model: {
              rockets: [...model.rockets, `R-${model.next}`],
              next: model.next + 1,
            },
          }
        : {},
    Dismantle: ({ name }, { model }) => ({
      model: { ...model, rockets: model.rockets.filter((r) => r !== name) },
    }),
  },
});
