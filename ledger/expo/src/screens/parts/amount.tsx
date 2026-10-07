import { Text } from '@kstackz/expo-toolkit/components/text';
import { money, type Way } from '@ledger/core/model';

/**
 * Money as it is read: in with a plus, out with a minus, a balance as it
 * stands, in digits that line up. Colour is the reader's to add, and only
 * for trouble.
 */
export function Amount(props: {
  readonly cents: number;
  readonly currency: string;
  readonly way?: Way;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const { cents, way } = props;
  const sign = way === 'in' ? '+' : way === 'out' ? '−' : cents < 0 ? '−' : '';
  return (
    <Text className={props.className} style={{ fontVariant: ['tabular-nums'] }}>
      {sign}
      {money(Math.abs(cents), props.currency, {
        compact: props.compact === true,
      })}
    </Text>
  );
}
