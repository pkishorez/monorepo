import { Effect, Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Invoices } from './invoices/index.ts';

/**
 * Everything under /settings/billing, the third level. Where the URL ends
 * here it draws the plan, which has no Actor; Invoices is its page. `meter`
 * runs for as long as the user is anywhere in billing.
 */
export const Billing = Route.page({
  path: '/billing',
  metadata: { title: 'Billing · Acme' },
  pages: { Invoices },
  model: Schema.Struct({ reads: Schema.Number }),
  message: Schema.TaggedUnion({ Metered: {} }),
}).build({
  init: () => ({ model: { reads: 0 } }),
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
