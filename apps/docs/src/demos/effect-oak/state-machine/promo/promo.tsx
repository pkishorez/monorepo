import { Context, Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Input } from '@kstackz/web-platform/components/input';

/*
 * The promo code field on the Review step. It keeps what is typed and, on
 * submit, hands the code to whoever Provides Promos: a Request. The checkout
 * decides whether the code is good, so the discount is in its State.
 */

export const Discount = Schema.Struct({
  code: Schema.String,
  percentOff: Schema.Number,
});
export type Discount = typeof Discount.Type;

const DISCOUNTS: ReadonlyArray<Discount> = [
  { code: 'READER10', percentOff: 10 },
  { code: 'SIGNAL20', percentOff: 20 },
];

/** The discount a typed code gives, if it gives one. */
export const discountFor = (code: string): Discount | null =>
  DISCOUNTS.find((each) => each.code === code.trim().toUpperCase()) ?? null;

/** Whoever takes submitted promo codes: the checkout, while in Review. */
export class Promos extends Context.Service<
  Promos,
  { readonly submit: (code: string) => void }
>()('docs/state-machine/Promos') {}

export const PromoCode = Node.make('PromoCode', {
  requires: { promos: Promos },
  model: Schema.Struct({ input: Schema.String }),
  message: Schema.TaggedUnion({
    Typed: { value: Schema.String },
    Submitted: {},
  }),
}).build({
  init: () => ({ model: { input: '' } }),
  update: {
    Typed: ({ value }) => ({ model: { input: value } }),
    Submitted: (_, { model }) =>
      model.input.trim() === ''
        ? {}
        : {
            commands: [
              Effect.gen(function* () {
                (yield* Promos).submit(model.input);
              }),
            ],
          },
  },
});

export const PromoCodeView = View.make(PromoCode, ({ model, send }) => (
  <form
    className="flex gap-2"
    onSubmit={(event) => {
      event.preventDefault();
      send({ _tag: 'Submitted' });
    }}
  >
    <Input
      aria-label="Promo code"
      placeholder="Promo code (try READER10)"
      value={model.input}
      onChange={(event) => send({ _tag: 'Typed', value: event.target.value })}
    />
    <Button type="submit" variant="outline">
      Apply
    </Button>
  </form>
));
