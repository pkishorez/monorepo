import type { Way } from './schemas.ts';

const formats = new Map<string, Intl.NumberFormat>();

const formatOf = (currency: string, compact: boolean) => {
  const key = `${currency}:${compact}`;
  let format = formats.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      ...(compact
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2 }),
    });
    formats.set(key, format);
  }
  return format;
};

// Compact money is rounded here, once, in whole cents: to a tenth of its
// scale, half away from zero. Left to the engine, a tie like 144.45 (stored
// as 144.4499…) became `$144.5` in Chrome and `$144.4` on Hermes. A scale
// that rounds up to a thousand moves to the next: `$999.96` is `$1K`.
const SCALES = [
  { at: 1, suffix: '' },
  { at: 1e3, suffix: 'K' },
  { at: 1e6, suffix: 'M' },
  { at: 1e9, suffix: 'B' },
] as const;

const compactParts = (cents: number) => {
  const size = Math.abs(cents);
  let scale: (typeof SCALES)[number] = SCALES[0];
  let tenths = 0;
  for (scale of SCALES) {
    // A tenth of the scale is `scale.at * 10` cents.
    tenths = Math.round(size / (scale.at * 10));
    if (tenths < 10_000) break;
  }
  return { tenths: cents < 0 ? -tenths : tenths, scale };
};

// Hermes' Intl has no compact notation: it ignores `notation` and prints
// `$1,600.0`. Where so, the suffix is written by hand.
let compactWorks: boolean | undefined;

const handCompact = (cents: number, currency: string) => {
  const { tenths, scale } = compactParts(cents);
  const text = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(tenths / 10);
  return `${text}${scale.suffix}`;
};

/** Cents as money: `$4.50`; compact, `$1.2K`. */
export const money = (
  cents: number,
  currency: string,
  options: { readonly compact?: boolean } = {},
) => {
  if (options.compact !== true)
    return formatOf(currency, false).format(cents / 100);
  compactWorks ??= !formatOf('USD', true).format(1500).includes('500');
  if (!compactWorks) return handCompact(cents, currency);
  const { tenths, scale } = compactParts(cents);
  return formatOf(currency, true).format((tenths * scale.at) / 10);
};

/** Cents with their sign: in is plus, out is minus. */
export const signed = (cents: number, way: Way) =>
  way === 'in' ? cents : -cents;

/** Typed digits as cents: `"4.5"` is 450; anything else is 0. */
export const centsOf = (typed: string) => {
  const match = /^(\d{0,9})(?:\.(\d{0,2}))?$/.exec(typed.trim());
  if (match === null) return 0;
  const [, whole = '', part = ''] = match;
  return Number(whole || '0') * 100 + Number(part.padEnd(2, '0'));
};

/** The currencies Settings offers. */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY'] as const;
