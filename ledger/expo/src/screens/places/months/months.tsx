import { Text } from '@kstackz/expo-toolkit/components/text';
import { useMoney } from '@ledger/core/client/session';
import { type MonthKey, monthName, monthsOf } from '@ledger/core/shared/ledger';
import { Placeholder } from '../../parts';

/** Months, a Place: every Month with Entries. Phase 3b draws the list. */
export function Months() {
  const money = useMoney();
  return (
    <Placeholder
      title="Months"
      description="Every month: what came in, what went out, and where it went."
    >
      <Text muted>
        {monthsOf(money.entries, money.categories).length} months.
      </Text>
    </Placeholder>
  );
}

/** One Month, a Place just under Months. Phase 3b draws it. */
export function Month(props: { readonly month: MonthKey }) {
  return (
    <Placeholder
      title={monthName(props.month)}
      description="In, out, and where it went by category."
    />
  );
}
