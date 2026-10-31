import { useState } from 'react';
import { View } from '@kestack/kabuki/react';
import type { Handle } from '@kestack/kabuki/react/view';
import { Button } from '@kestack/web-platform/ui/components/button';
import { CircleCheckIcon } from 'lucide-react';
import type { CartLive } from './cart.ts';
import { CartView } from './cart-view.tsx';
import type { ProductLive } from './product.ts';
import { ProductView } from './product-view.tsx';
import { countOf, formatPrice } from './products.ts';
import { ShopLive } from './shop.ts';

// Shopping draws the list and the Cart. Placed draws the order just made.
export const ShopView = View.make(
  ShopLive,
  ({ _tag, state, model, children, send, root }) => {
    switch (_tag) {
      case 'Shopping':
        return (
          <div {...root} className="@container h-[17rem] w-full max-w-2xl">
            <Shelves
              products={children.products}
              cart={children.cart}
              count={countOf(model.lines)}
            />
          </div>
        );
      case 'Placed':
        return (
          <div
            {...root}
            className="flex flex-col items-center gap-1 text-center"
          >
            <CircleCheckIcon
              className="mb-2 size-10 text-emerald-600"
              strokeWidth={1.5}
            />
            <p className="text-lg font-semibold">Order placed</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {state.items} {state.items === 1 ? 'item' : 'items'} ·{' '}
              {formatPrice(state.total)}
            </p>
            <Button
              variant="outline"
              className="mt-4 h-10"
              onClick={() => send({ _tag: 'Restarted' })}
            >
              Start a new order
            </Button>
          </div>
        );
    }
  },
);

/**
 * The list and the Cart side by side, or as two tabs when narrow. Which tab
 * is open is only how it's drawn, so React keeps it, not the Shop.
 */
function Shelves({
  products,
  cart,
  count,
}: {
  readonly products: ReadonlyArray<Handle<typeof ProductLive>>;
  readonly cart: Handle<typeof CartLive>;
  readonly count: number;
}) {
  const [tab, setTab] = useState<'products' | 'cart'>('products');
  const shown = (pane: typeof tab) =>
    tab === pane ? 'flex' : 'hidden @lg:flex';
  return (
    <div className="flex h-full flex-col gap-2 @lg:grid @lg:grid-cols-[1fr_18rem] @lg:gap-4">
      <div
        role="tablist"
        className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1 @lg:hidden"
      >
        {(['products', 'cart'] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={tab === pane}
            onClick={() => setTab(pane)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-xs focus-visible:outline-2 focus-visible:outline-ring"
          >
            {pane === 'products' ? 'Products' : 'Cart'}
            {pane === 'cart' && count > 0 && (
              <span className="rounded-full bg-foreground px-1.5 text-xs text-background tabular-nums">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>
      <ul
        aria-label="Products"
        className={`${shown('products')} min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border bg-background`}
      >
        {products.map((product) => (
          <ProductView key={product.key} instance={product} />
        ))}
      </ul>
      <div className={`${shown('cart')} min-h-0 flex-1 flex-col @lg:h-full`}>
        <CartView instance={cart} />
      </div>
    </div>
  );
}
