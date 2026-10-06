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

// Hermes' Intl has no compact notation: it ignores `notation` and prints
// `$1,600.0`. Where so, compact money is written out by hand.
let compactWorks: boolean | undefined;
const SCALES = [
  { at: 1e9, suffix: 'B' },
  { at: 1e6, suffix: 'M' },
  { at: 1e3, suffix: 'K' },
] as const;

const handCompact = (value: number, currency: string) => {
  const scale = SCALES.find((each) => Math.abs(value) >= each.at);
  const short = scale ? value / scale.at : value;
  const text = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(short);
  return scale ? `${text}${scale.suffix}` : text;
};

/** Cents as money: `$4.50`; compact, `$1.2K`. */
export const money = (
  cents: number,
  currency: string,
  options: { readonly compact?: boolean } = {},
) => {
  const compact = options.compact === true;
  if (compact) {
    compactWorks ??= !formatOf('USD', true).format(1500).includes('500');
    if (!compactWorks) return handCompact(cents / 100, currency);
  }
  return formatOf(currency, compact).format(cents / 100);
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
