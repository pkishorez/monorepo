import { Effect, Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Billing } from './billing/index.ts';
import { Profile } from './profile/index.ts';

/**
 * The wrapper around every settings page. Where the URL ends here it draws
 * the profile form, an Actor of its own made only then; Billing is its
 * page. `autosave` runs on every page under /settings and stops only when
 * the user leaves it; each section's Actor comes and goes with the Route.
 */
export const Settings = Route.page({
  path: '/settings',
  metadata: { title: 'Settings · Acme' },
  pages: { Billing },
  model: Schema.Struct({ saves: Schema.Number }),
  message: Schema.TaggedUnion({ Saved: {} }),
}).build({
  init: () => ({ model: { saves: 0 } }),
  children: {
    profile: {
      actor: Profile.actor,
      while: ({ props }) => !props.route.page,
    },
  },
  workers: {
    autosave: {
      run: (self) =>
        Effect.forever(
          Effect.sleep('2 seconds').pipe(
            Effect.andThen(self.send({ _tag: 'Saved' })),
          ),
        ),
    },
  },
  on: { Saved: (_, { model }) => ({ model: { saves: model.saves + 1 } }) },
});
