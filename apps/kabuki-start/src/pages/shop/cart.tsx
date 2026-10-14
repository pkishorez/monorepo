import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import {
  Card,
  CardContent,
  CardFooter,
} from '@kestack/web-platform/components/card';
import { Separator } from '@kestack/web-platform/components/separator';
import { Page, link } from '../../parts/index.ts';
import { Routes } from '../../routes.ts';
import { Session } from '../../session/index.ts';

/** Clears the cart cookie in the browser. */
const empty = Command.make('empty the cart', {
  args: Schema.Struct({}),
  run: () => Effect.sync(Session.emptyCart),
});

/** The cart: dynamic under the static shop, read from the cart cookie of each request. */
const CartActor = Actor.make('Cart', {
  input: Routes.Shop.Cart.input,
  props: Routes.Shop.Cart.props,
  model: Routes.Shop.Cart.input,
  message: Schema.TaggedUnion({ EmptyClicked: {} }),
}).build({
  init: (cart) => ({ model: cart }),
  on: {
    EmptyClicked: (_, { model }) => ({
      model: { ...model, items: [] },
      command: empty({}),
    }),
  },
});

const CartView = View.make(CartActor, ({ model, send, root }) => {
  const total = model.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  return (
    <div {...root}>
      <Page
        place="Shop.Cart"
        loadedAt={model.loadedAt}
        title="Cart"
        intro="A dynamic place under a static one: the shop is the same for everyone, the cart is yours."
      >
        <Card className="max-w-md">
          {model.items.length === 0 ? (
            <CardContent>
              <p className="text-muted-foreground">The cart is empty.</p>
            </CardContent>
          ) : (
            <>
              <CardContent>
                <ul className="divide-y divide-border">
                  {model.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex justify-between gap-4 py-2.5 first:pt-0"
                    >
                      <span>{`${item.name} × ${item.quantity}`}</span>
                      <span className="tabular-nums text-muted-foreground">
                        ${item.price * item.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <p className="font-medium tabular-nums">{`Total $${total}`}</p>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => send({ _tag: 'EmptyClicked' })}
                >
                  Empty the cart
                </Button>
              </CardFooter>
            </>
          )}
        </Card>
        <Router.Link to={Routes.Shop.Index()} className={`${link} text-sm`}>
          Back to the shop
        </Router.Link>
      </Page>
    </div>
  );
});

export const Cart = { actor: CartActor, view: CartView };
