import { Effect, Layer, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Hangar } from './hangar.js';
import { Rocket } from './rocket.js';
import { Weather } from './weather.js';

export const Fleet = Actor.make('Fleet', {
  model: Schema.Struct({
    rockets: Schema.Array(Schema.String),
    next: Schema.Number,
    sky: Schema.Literals(['clear', 'storm']),
  }),
  message: Schema.TaggedUnion({
    Build: {},
    Dismantle: { name: Schema.String },
    ToggledSky: {},
  }),
}).build({
  init: () => ({ model: { rockets: ['R-1'], next: 2, sky: 'clear' } }),
  children: { rockets: Actor.many(Rocket) },
  provides: (self) =>
    Layer.mergeAll(
      Layer.succeed(Weather, {
        sky: self.get.pipe(Effect.map(({ model }) => model.sky)),
      }),
      Layer.succeed(Hangar, {
        dismantle: (name) => self.send({ _tag: 'Dismantle', name }),
      }),
    ),
  invoke: ({ model }) => ({
    rockets: model.rockets.map((name) => ({ key: name, input: { name } })),
  }),
  on: {
    Build: (_, { model }) =>
      model.rockets.length < 20
        ? {
            model: {
              ...model,
              rockets: [...model.rockets, `R-${model.next}`],
              next: model.next + 1,
            },
          }
        : {},
    Dismantle: ({ name }, { model }) => ({
      model: { ...model, rockets: model.rockets.filter((r) => r !== name) },
    }),
    ToggledSky: (_, { model }) => ({
      model: { ...model, sky: model.sky === 'clear' ? 'storm' : 'clear' },
    }),
  },
});
