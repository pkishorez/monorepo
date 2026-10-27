import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  MinusIcon,
  PlusIcon,
  ShoppingCartIcon,
  Trash2Icon,
} from 'lucide-react';
import { CartLive } from './cart.ts';
import { PRODUCTS, countOf, formatPrice, totalOf } from './products.ts';

// A visual size of 32px, with a hit area of 40px.
const STEP = 'relative after:absolute after:-inset-1';

// The lines the Shop hands down, a total, and a way to pay.
export const CartView = View.make(CartLive, ({ props, send, root }) => {
  const count = countOf(props.lines);
  return (
    <section
      {...root}
      aria-label="Cart"
      className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-background"
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <h3 className="text-sm font-medium">Cart</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      </header>
      {props.lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
          <ShoppingCartIcon className="mb-1 size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Your cart is empty</p>
          <p className="text-xs text-muted-foreground">
            Add a product to start an order.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {props.lines.map(({ id, quantity }) => {
            const product = PRODUCTS[id]!;
            return (
              <li key={id} className="flex h-12 items-center gap-2 pr-2 pl-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {product.name}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatPrice(product.price * quantity)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={STEP}
                    aria-label={
                      quantity === 1
                        ? `Remove ${product.name}`
                        : `One less ${product.name}`
                    }
                    onClick={() => send({ _tag: 'Decreased', id })}
                  >
                    {quantity === 1 ? <Trash2Icon /> : <MinusIcon />}
                  </Button>
                  <output className="min-w-[2ch] text-center text-sm tabular-nums">
                    {quantity}
                  </output>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={STEP}
                    aria-label={`One more ${product.name}`}
                    onClick={() => send({ _tag: 'Increased', id })}
                  >
                    <PlusIcon />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border p-3">
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="text-base font-semibold tabular-nums">
            {formatPrice(totalOf(props.lines))}
          </span>
        </span>
        <Button
          className="h-10 px-4"
          disabled={count === 0}
          onClick={() => send({ _tag: 'CheckedOut' })}
        >
          Check out
        </Button>
      </footer>
    </section>
  );
});
