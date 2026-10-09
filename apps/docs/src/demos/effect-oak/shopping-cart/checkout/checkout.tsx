import { Effect, Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Label } from '@kstackz/web-platform/components/label';
import { Textarea } from '@kstackz/web-platform/components/textarea';
import { Basket } from '../basket/index.js';
import { ShopServer } from '../shop-server/index.js';

/*
 * The checkout page: delivery instructions, then Placing while the
 * ShopServer takes the order, then Placed. The Command reads the cart from
 * Basket when it runs (a Command sees the latest Services), sends it with
 * the instructions, and asks the shop to empty the cart: a Request.
 */

const placeOrder = (instructions: string) =>
  Effect.gen(function* () {
    const basket = yield* Basket;
    const orderId = yield* (yield* ShopServer).placeOrder(
      basket.cart,
      instructions,
    );
    basket.clear();
    return { _tag: 'SucceededPlaceOrder' as const, orderId };
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({ _tag: 'FailedPlaceOrder' as const, error }),
    ),
  );

export const Checkout = Node.make('Checkout', {
  requires: { shop: ShopServer, basket: Basket },
  model: Schema.Struct({ instructions: Schema.String }),
  state: Schema.TaggedUnion({
    Editing: { error: Schema.NullOr(Schema.String) },
    Placing: {},
    Placed: { orderId: Schema.String },
  }),
  message: Schema.TaggedUnion({
    ChangedInstructions: { value: Schema.String },
    ClickedPlaceOrder: {},
    SucceededPlaceOrder: { orderId: Schema.String },
    FailedPlaceOrder: { error: Schema.String },
  }),
}).build({
  init: () => ({
    model: { instructions: '' },
    state: { _tag: 'Editing', error: null },
  }),
  update: {
    Editing: {
      ChangedInstructions: ({ value }) => ({ model: { instructions: value } }),
      ClickedPlaceOrder: (_, { model }) => ({
        state: { _tag: 'Placing' },
        commands: [placeOrder(model.instructions)],
      }),
    },
    Placing: {
      SucceededPlaceOrder: ({ orderId }) => ({
        model: { instructions: '' },
        state: { _tag: 'Placed', orderId },
      }),
      FailedPlaceOrder: ({ error }) => ({
        state: { _tag: 'Editing', error },
      }),
    },
  },
});

const Form = ({
  instructions,
  error = null,
  placing = false,
  send,
}: {
  readonly instructions: string;
  readonly error?: string | null;
  readonly placing?: boolean;
  readonly send: (
    message:
      | { readonly _tag: 'ChangedInstructions'; readonly value: string }
      | { readonly _tag: 'ClickedPlaceOrder' },
  ) => void;
}) => (
  <div className="flex flex-col gap-3">
    <Label htmlFor="delivery-instructions">Delivery instructions</Label>
    <Textarea
      id="delivery-instructions"
      placeholder="Leave at the side door…"
      value={instructions}
      disabled={placing}
      onChange={(event) =>
        send({ _tag: 'ChangedInstructions', value: event.target.value })
      }
    />
    {error && <p className="text-sm text-destructive">{error}</p>}
    <Button
      className="self-start"
      disabled={placing}
      onClick={() => send({ _tag: 'ClickedPlaceOrder' })}
    >
      {placing ? 'Placing order…' : 'Place order'}
    </Button>
  </div>
);

export const CheckoutView = View.make(Checkout, {
  Editing: ({ model, state, send }) => (
    <Form {...model} error={state.error} send={send} />
  ),
  Placing: ({ model, send }) => <Form {...model} placing send={send} />,
  Placed: ({ state }) => (
    <div className="rounded-lg border p-4">
      <p className="font-medium">Order {state.orderId} placed.</p>
      <p className="text-sm text-muted-foreground">
        Thanks! Your cart is empty again.
      </p>
    </div>
  ),
});
