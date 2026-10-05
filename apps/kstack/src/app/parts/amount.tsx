import { cn } from '@kstackz/ui-toolkit/utils';
import { money, type Way } from '../../domain/ledger/index.ts';

/**
 * Money as it is read: in with a plus, out with a minus, a balance as it
 * stands. Digits line up in columns. Colour is the reader's to add, and
 * only for trouble.
 */
export function Amount(props: {
  readonly cents: number;
  readonly currency: string;
  readonly way?: Way;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const { cents, way } = props;
  const text = money(Math.abs(cents), props.currency, {
    compact: props.compact === true,
  });
  const sign = way === 'in' ? '+' : way === 'out' ? '−' : cents < 0 ? '−' : '';
  return (
    <span className={cn('tabular-nums', props.className)}>
      {sign}
      {text}
    </span>
  );
}
