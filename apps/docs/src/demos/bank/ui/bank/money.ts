const formatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
});

export const formatMoney = (amount: number): string => formatter.format(amount);
