import { Minus, Plus, X } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import { money, totalPrice } from '../basket/index.js';
import type { Cart } from '../basket/index.js';

/** What a cart line can ask for; the shop turns each into its own Message. */
type Actions = {
  readonly increment: (itemId: string) => void;
  readonly decrement: (itemId: string) => void;
  readonly remove: (itemId: string) => void;
  readonly clear: () => void;
};

/** The cart's lines with their quantities, and the total. A drawing of the shop's Model. */
export const CartPage = ({
  cart,
  actions,
}: {
  readonly cart: Cart;
  readonly actions: Actions;
}) =>
  cart.length === 0 ? (
    <p className="py-6 text-center text-sm text-muted-foreground">
      Your cart is empty.
    </p>
  ) : (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y rounded-lg border">
        {cart.map(({ item, quantity }) => (
          <li key={item.id} className="flex items-center gap-3 p-3">
            <span className="flex-1 font-medium">{item.name}</span>
            <Button
              size="icon-xs"
              variant="outline"
              aria-label={`One less ${item.name}`}
              onClick={() => actions.decrement(item.id)}
            >
              <Minus />
            </Button>
            <span className="w-6 text-center tabular-nums">{quantity}</span>
            <Button
              size="icon-xs"
              variant="outline"
              aria-label={`One more ${item.name}`}
              onClick={() => actions.increment(item.id)}
            >
              <Plus />
            </Button>
            <span className="w-16 text-right tabular-nums">
              {money(item.price * quantity)}
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove ${item.name}`}
              onClick={() => actions.remove(item.id)}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={actions.clear}>
          Clear cart
        </Button>
        <p className="font-semibold tabular-nums">
          Total {money(totalPrice(cart))}
        </p>
      </div>
    </div>
  );
