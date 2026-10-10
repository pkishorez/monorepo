import { Effect, Layer, Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Weather } from '../capabilities/index.js';
import { Rocket } from './rocket.js';

/** The same site as in Capabilities, with the Rocket that counts down. */
export const LaunchSite = Actor.make('LaunchSite', {
  model: Schema.Struct({
    rockets: Schema.Array(Schema.String),
    next: Schema.Number,
    weather: Schema.Literals(['clear', 'storm']),
  }),
  message: Schema.TaggedUnion({ Built: {}, ToggledStorm: {} }),
  provides: [Weather],
  children: { rockets: Actor.many(Rocket) },
}).build({
  init: () => ({ model: { rockets: ['R-1'], next: 2, weather: 'clear' } }),
  provides: (self) =>
    Layer.succeed(Weather, {
      sky: self.get.pipe(Effect.map(({ model }) => model.weather)),
    }),
  invoke: ({ model }) => ({
    rockets: model.rockets.map((id) => ({ key: id })),
  }),
  update: {
    Built: (_, { model }) => ({
      model: {
        ...model,
        rockets: [...model.rockets, `R-${model.next}`],
        next: model.next + 1,
      },
    }),
    ToggledStorm: (_, { model }) => ({
      model: {
        ...model,
        weather: model.weather === 'clear' ? 'storm' : 'clear',
      },
    }),
  },
});
