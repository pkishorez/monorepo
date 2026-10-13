import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Routes } from '../../routes/index.ts';
import { Billing } from './billing/index.ts';
import { Profile } from './profile/index.ts';

export const pages = Routes.Settings.outlet({ Profile, Billing });

/**
 * The wrapper around every settings page. `autosave` runs on every page
 * under /settings and stops only when the user leaves it; each section's
 * Actor comes and goes with the Route.
 */
export const SettingsActor = Actor.make('Settings', {
  props: Routes.Settings.props,
  model: Schema.Struct({ saves: Schema.Number }),
  message: Schema.TaggedUnion({ Saved: {} }),
}).build({
  init: () => ({ model: { saves: 0 } }),
  children: pages.children,
  invoke: pages.invoke,
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
