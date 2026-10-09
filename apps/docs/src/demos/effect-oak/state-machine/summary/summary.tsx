/*
 * The order summary beside every step: the book, its price, any discount,
 * tax and the total. A drawing of the checkout's data, not a Node.
 */

const PHYSICAL_PRICE = 52;
const DIGITAL_PRICE = 28;
const SALES_TAX_RATE = 0.0825;

type Discount = { readonly code: string; readonly percentOff: number };

const money = (amount: number) => `$${amount.toFixed(2)}`;
const cents = (amount: number) => Math.round(amount * 100) / 100;

/** The edition's name, from whether it ships. */
export const editionName = (shipping: boolean) =>
  shipping ? 'Hardcover' : 'E-book';

export const editionPrice = (shipping: boolean) =>
  money(shipping ? PHYSICAL_PRICE : DIGITAL_PRICE);

const pricing = (shipping: boolean, discount: Discount | null) => {
  const subtotal = shipping ? PHYSICAL_PRICE : DIGITAL_PRICE;
  const off = discount ? cents((subtotal * discount.percentOff) / 100) : 0;
  const tax = cents((subtotal - off) * SALES_TAX_RATE);
  return { subtotal, off, tax, total: cents(subtotal - off + tax) };
};

const Row = ({
  label,
  value,
  strong = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
}) => (
  <div
    className={`flex justify-between gap-4 ${strong ? 'font-semibold' : 'text-muted-foreground'}`}
  >
    <span>{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

export const OrderSummary = ({
  shipping,
  discount,
}: {
  readonly shipping: boolean;
  readonly discount: Discount | null;
}) => {
  const { subtotal, off, tax, total } = pricing(shipping, discount);
  return (
    <aside className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <h2 className="font-semibold">Order summary</h2>
      <p>
        <span className="font-medium">Signals and Systems</span>
        <span className="text-muted-foreground">
          {' '}
          · {editionName(shipping)}
        </span>
      </p>
      <Row label="Subtotal" value={money(subtotal)} />
      {discount && (
        <Row label={`Promo ${discount.code}`} value={`−${money(off)}`} />
      )}
      <Row label="Tax" value={money(tax)} />
      <Row label="Shipping" value={shipping ? 'Free' : 'None'} />
      <hr />
      <Row label="Total" value={money(total)} strong />
    </aside>
  );
};
