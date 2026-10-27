import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  CoffeeIcon,
  LampDeskIcon,
  NotebookPenIcon,
  PlusIcon,
  ShoppingBagIcon,
  SproutIcon,
} from 'lucide-react';
import { ProductLive } from './product.ts';
import { PRODUCTS, formatPrice } from './products.ts';

// A swatch per product, in place of a photo.
const LOOKS = {
  mug: {
    Icon: CoffeeIcon,
    tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  tote: {
    Icon: ShoppingBagIcon,
    tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  notebook: {
    Icon: NotebookPenIcon,
    tone: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
  lamp: {
    Icon: LampDeskIcon,
    tone: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  plant: {
    Icon: SproutIcon,
    tone: 'bg-lime-500/20 text-lime-700 dark:text-lime-300',
  },
} as Record<string, { Icon: typeof CoffeeIcon; tone: string }>;

// One row of the list. Add asks the Basket; the count comes back as Props.
export const ProductView = View.make(
  ProductLive,
  ({ model, props, send, root }) => {
    const product = PRODUCTS[model.id]!;
    const { Icon, tone } = LOOKS[model.id]!;
    return (
      <li {...root} className="flex min-h-12 flex-1 items-center gap-3 px-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-md ${tone}`}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {product.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {props.inCart > 0 ? (
              <span className="text-foreground tabular-nums">
                {props.inCart} in cart
              </span>
            ) : (
              product.note
            )}
          </span>
        </span>
        <span className="text-sm tabular-nums">
          {formatPrice(product.price)}
        </span>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Add ${product.name}`}
          className="relative after:absolute after:-inset-1"
          onClick={() => send({ _tag: 'Added' })}
        >
          <PlusIcon />
          Add
        </Button>
      </li>
    );
  },
);
