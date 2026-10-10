import type { ReactNode } from 'react';
import type { Snapshot } from 'effect-oak';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { money, totalItems, totalPrice } from './basket/index.js';
import type { Cart } from './basket/index.js';
import { CartPage } from './cart-page/index.js';
import { CheckoutView } from './checkout/index.js';
import { ProductsView } from './products/index.js';
import { Shop } from './shopping-cart.js';

type Send = Snapshot<typeof Shop>['send'];

const PAGES = ['Products', 'Cart', 'Checkout'] as const;

/** The nav and the page's title around one page's content. */
const Page = ({
  page,
  cart,
  send,
  children,
}: {
  readonly page: (typeof PAGES)[number];
  readonly cart: Cart;
  readonly send: Send;
  readonly children: ReactNode;
}) => {
  const count = totalItems(cart);
  return (
    <div className="size-full overflow-y-auto">
      <nav className="flex gap-1 border-b px-6 py-2">
        {PAGES.map((each) => (
          <Button
            key={each}
            size="sm"
            variant={each === page ? 'secondary' : 'ghost'}
            onClick={() => send({ _tag: 'ClickedPage', page: each })}
          >
            {each === 'Cart' && count > 0 ? `Cart (${count})` : each}
          </Button>
        ))}
      </nav>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold">{page}</h1>
        {children}
      </main>
    </div>
  );
};

export const ShopView = View.make(Shop, {
  Products: ({ model, children, send }) => (
    <Page page="Products" cart={model.cart} send={send}>
      <ProductsView node={children.products} />
    </Page>
  ),
  Cart: ({ model, send }) => (
    <Page page="Cart" cart={model.cart} send={send}>
      <CartPage
        cart={model.cart}
        actions={{
          increment: (itemId) => send({ _tag: 'ClickedIncrement', itemId }),
          decrement: (itemId) => send({ _tag: 'ClickedDecrement', itemId }),
          remove: (itemId) => send({ _tag: 'ClickedRemove', itemId }),
          clear: () => send({ _tag: 'ClickedClear' }),
        }}
      />
    </Page>
  ),
  Checkout: ({ model, children, send }) => (
    <Page page="Checkout" cart={model.cart} send={send}>
      <p className="text-sm text-muted-foreground">
        {totalItems(model.cart)} items · {money(totalPrice(model.cart))}
      </p>
      <CheckoutView node={children.checkout} />
    </Page>
  ),
});
