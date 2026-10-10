import { Schema } from 'effect';
import { Actor } from 'effect-oak';
import { Rocket } from './rocket.js';

/** The rockets on the site, each one its own Rocket Instance, keyed by id. */
export const LaunchSite = Actor.make('LaunchSite', {
  model: Schema.Struct({
    rockets: Schema.Array(Schema.String),
    next: Schema.Number,
  }),
  message: Schema.TaggedUnion({ Built: {} }),
  children: { rockets: Actor.many(Rocket) },
}).build({
  init: () => ({ model: { rockets: ['R-1'], next: 2 } }),
  invoke: ({ model }) => ({
    rockets: model.rockets.map((id) => ({ key: id })),
  }),
  update: {
    Built: (_, { model }) => ({
      model: {
        rockets: [...model.rockets, `R-${model.next}`],
        next: model.next + 1,
      },
    }),
  },
});
