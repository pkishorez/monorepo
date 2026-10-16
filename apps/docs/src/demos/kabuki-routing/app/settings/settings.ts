import { Effect, Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Billing, BillingLive } from './billing/index.ts';
import { ProfileLive } from './profile/index.ts';

/**
 * The wrapper around every settings page. Where the URL ends here it draws
 * the profile form, an Actor of its own made only then; Billing is its
 * page. `autosave` runs on every page under /settings and stops only when
 * the user leaves it; each section's Actor comes and goes with the Route.
 */
export const Settings = Page.define({
  path: '/settings',
  metadata: { title: 'Settings · Acme' },
  pages: { Billing },
  model: Schema.Struct({ saves: Schema.Number }),
  message: Schema.TaggedUnion({ Saved: {} }),
});

export const SettingsLive = Page.build(Settings, {
  pages: { Billing: BillingLive },
  init: () => ({ model: { saves: 0 } }),
  children: {
    profile: {
      actor: ProfileLive,
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
