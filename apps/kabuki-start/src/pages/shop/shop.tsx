import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  Button,
  buttonVariants,
} from '@kestack/web-platform/components/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@kestack/web-platform/components/card';
import { Page, Provenance } from '../../parts/index.ts';
import { Routes } from '../../routes.ts';
import { Session } from '../../session/index.ts';
import { Cart } from './cart.tsx';

/*
 * The shop: its products are static, the same for everyone, and its own
 * View draws them as its index. Adding one writes the cart cookie in the
 * browser; the cart under the shop reads it.
 */

const sections = Routes.Shop.outlet({ Index: () => null, Cart });

const add = Command.make('add to the cart', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) => Effect.sync(() => Session.addToCart(id)),
});

const ShopActor = Actor.make('Shop', {
  input: Routes.Shop.input,
  props: Routes.Shop.props,
  model: Schema.Struct({
    products: Routes.Shop.input,
    added: Schema.Number,
  }),
  message: Schema.TaggedUnion({ AddClicked: { id: Schema.String } }),
}).build({
  init: (products) => ({ model: { products, added: 0 } }),
  children: sections.children,
  invoke: sections.invoke,
  on: {
    AddClicked: ({ id }, { model }) => ({
      model: { ...model, added: model.added + 1 },
      command: add({ id }),
    }),
  },
});

const ShopView = View.make(ShopActor, (self) => (
  <div {...self.root} className="space-y-10">
    {self.props.page._tag === 'Index' ? (
      <Page
        place="Shop.Index"
        title="Shop"
        intro="Add a few things, then open the cart: it is loaded for you, from your cookie."
      >
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {self.model.products.products.map((product) => (
            <li key={product.id}>
              <Card size="sm" className="h-full">
                <CardHeader>
                  <CardTitle>{product.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">
                    ${product.price}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      self.send({ _tag: 'AddClicked', id: product.id })
                    }
                  >
                    Add to cart
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-3 text-sm text-muted-foreground">
          <Router.Link
            to={Routes.Shop.Cart()}
            className={buttonVariants({ size: 'sm' })}
          >
            Open the cart
          </Router.Link>
          {self.model.added > 0 && `${self.model.added} added. `}
        </p>
      </Page>
    ) : (
      <sections.View of={self} />
    )}
    <Provenance place="Shop" loadedAt={self.model.products.loadedAt} />
  </div>
));

export const Shop = { actor: ShopActor, view: ShopView };
