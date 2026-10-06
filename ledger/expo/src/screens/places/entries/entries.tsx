import { Text } from '@kstackz/expo-toolkit/components/text';
import { useMoney } from '@ledger/core/client/session';
import { Placeholder } from '../../parts';

/**
 * Entries, a Place: every Entry, newest first, of one Account when
 * `account` is given. Phase 3b draws the list and swipe-to-delete rows.
 */
export function Entries(props: { readonly account?: string | undefined }) {
  const money = useMoney();
  const account = money.accounts.find((each) => each.id === props.account);
  const shown = money.entries.filter(
    (entry) => account === undefined || entry.accountId === account.id,
  );
  return (
    <Placeholder
      title={account === undefined ? 'Entries' : `${account.name}’s entries`}
      description="Every entry, newest first, by day."
    >
      <Text muted>{shown.length} entries.</Text>
    </Placeholder>
  );
}

/** One Entry, a Place just under Entries. Phase 3b draws it. */
export function Entry(props: { readonly entryId: string }) {
  const money = useMoney();
  const entry = money.entries.find((each) => each.id === props.entryId);
  return (
    <Placeholder
      title="Entry"
      description="How much, in or out, what for, from which account, on which day, with a memo."
    >
      <Text muted>{entry === undefined ? 'No such entry.' : entry.memo}</Text>
    </Placeholder>
  );
}
