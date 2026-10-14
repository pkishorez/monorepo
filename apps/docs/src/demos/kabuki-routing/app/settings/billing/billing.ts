import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Routes } from '../../../routes/index.ts';
import { Invoices } from './invoices/index.ts';
import { Plan } from './plan.tsx';

/** Billing's two pages: Plan has no Actor, a function draws it; Invoices has one. */
export const pages = Routes.Settings.Billing.outlet({ Plan, Invoices });

/**
 * Everything under /settings/billing, the third level. `meter` runs for as
 * long as the user is anywhere in billing.
 */
export const BillingActor = Actor.make('Billing', {
  props: Routes.Settings.Billing.props,
  model: Schema.Struct({ reads: Schema.Number }),
  message: Schema.TaggedUnion({ Metered: {} }),
}).build({
  init: () => ({ model: { reads: 0 } }),
  children: pages.children,
  workers: {
    meter: {
      run: (self) =>
        Effect.forever(
          Effect.sleep('1 second').pipe(
            Effect.andThen(self.send({ _tag: 'Metered' })),
          ),
        ),
    },
  },
  on: { Metered: (_, { model }) => ({ model: { reads: model.reads + 1 } }) },
});
