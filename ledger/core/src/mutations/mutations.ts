import { useMemo } from 'react';
import type { Account, Entry } from '../model/index.ts';
import { useSession } from '../session/index.ts';

/**
 * Every way a screen changes money: each shows at once and rolls back if
 * the Backend refuses it. Writes to one row go straight to its Collection;
 * the Backend's own commands (Sample, Clear) run on the Backend, and their
 * changes arrive as any other's do.
 */
export const useMutations = () => {
  const ledger = useSession();
  return useMemo(
    () => ({
      addEntry: (entry: Omit<Entry, 'id' | 'userId' | 'createdAt'>) => {
        const id = crypto.randomUUID();
        ledger.entries.insert({
          ...entry,
          id,
          userId: ledger.userId,
          createdAt: new Date().toISOString(),
        });
        return id;
      },
      updateEntry: (id: string, changes: Partial<Entry>) =>
        ledger.entries.update(id, (draft) => {
          Object.assign(draft, changes);
        }),
      removeEntry: (id: string) => ledger.entries.delete(id),
      /** Brings back a deleted Entry, as it was. */
      restoreEntry: (entry: Entry) => ledger.entries.insert(entry),
      addAccount: (account: Pick<Account, 'name' | 'kind'>) => {
        const id = crypto.randomUUID();
        ledger.accounts.insert({
          ...account,
          id,
          userId: ledger.userId,
          createdAt: new Date().toISOString(),
        });
        return id;
      },
      renameAccount: (id: string, name: string) =>
        ledger.accounts.update(id, (draft) => {
          draft.name = name;
        }),
      setCurrency: (currency: string) => {
        if (ledger.preferences.has(ledger.userId)) {
          ledger.preferences.update(ledger.userId, (draft) => {
            draft.currency = currency;
          });
        } else {
          ledger.preferences.insert({ userId: ledger.userId, currency });
        }
      },
      sample: (entries: boolean) => ledger.sample(entries),
      clear: () => ledger.clear(),
    }),
    [ledger],
  );
};
