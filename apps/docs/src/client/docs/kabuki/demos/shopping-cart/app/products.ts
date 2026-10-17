/** What the shop sells, by id. Prices are in cents. */
export const PRODUCTS: Record<
  string,
  { readonly name: string; readonly note: string; readonly price: number }
> = {
  mug: { name: 'Ceramic mug', note: 'Holds 350 ml', price: 1800 },
  tote: { name: 'Linen tote', note: 'Fits a laptop', price: 2400 },
  notebook: { name: 'Notebook', note: '120 dotted pages', price: 1200 },
  lamp: { name: 'Desk lamp', note: 'Warm, dimmable', price: 6400 },
  plant: { name: 'Pothos', note: 'Hard to kill', price: 3200 },
};

/** One product in the cart, and how many of it. */
export interface Line {
  readonly id: string;
  readonly quantity: number;
}

export const totalOf = (lines: ReadonlyArray<Line>) =>
  lines.reduce(
    (sum, line) => sum + PRODUCTS[line.id]!.price * line.quantity,
    0,
  );

export const countOf = (lines: ReadonlyArray<Line>) =>
  lines.reduce((sum, line) => sum + line.quantity, 0);

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const formatPrice = (cents: number) => dollars.format(cents / 100);
