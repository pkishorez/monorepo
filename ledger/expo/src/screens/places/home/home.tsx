import { Button } from '@kstackz/expo-toolkit/components/button';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { useMoney, useUser, useWrites } from '@ledger/core/client/session';
import { useState } from 'react';
import { useOnline } from '../../../ledger';
import { Placeholder } from '../../parts';

/**
 * Home, a Place: this Month at a glance. Phase 3b draws it; for now it says
 * whose money is open, and can load the sample money.
 */
export function Home() {
  const user = useUser();
  const money = useMoney();
  const { sample } = useWrites();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      await sample(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Placeholder
      title={`${user.name}’s money`}
      description="This month at a glance: what is left, in against out, the budgets and the latest entries."
    >
      <Text muted>
        {money.ready
          ? `${money.entries.length} entries in ${money.accounts.length} accounts.`
          : 'Opening…'}
      </Text>
      {money.ready && money.accounts.length === 0 && (
        <Button
          variant="outline"
          disabled={!online || busy}
          onPress={() => void load()}
        >
          Load sample money
        </Button>
      )}
    </Placeholder>
  );
}
