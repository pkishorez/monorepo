import { Text } from '@kstackz/expo-toolkit/components/text';
import { money, type Way } from '@ledger/core/shared/ledger';

/**
 * Money as it is read: in with a plus, out with a minus, a balance as it
 * stands, in digits that line up.
 */
export function Amount(props: {
  readonly cents: number;
  readonly currency: string;
  readonly way?: Way;
  readonly className?: string;
}) {
  const { cents, way } = props;
  const sign = way === 'in' ? '+' : way === 'out' ? '−' : cents < 0 ? '−' : '';
  return (
    <Text className={props.className} style={{ fontVariant: ['tabular-nums'] }}>
      {sign}
      {money(Math.abs(cents), props.currency)}
    </Text>
  );
}
