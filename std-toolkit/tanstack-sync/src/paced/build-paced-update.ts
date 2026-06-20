import type { BaseStrategy, Strategy, Transaction } from '@tanstack/react-db';
import { createPacedMutations } from '@tanstack/react-db';

/**
 * Builds one paced-update entry point over a single in-flight gate. `optimistic`
 * applies the immediate UI change; `commit` runs the server mutation against the
 * *merged* changes once the pace strategy releases. Shared by keyed `sync` (one per
 * key) and `singleItemSync` (one per collection); the strategy instance owns the
 * gate, so callers get isolation by handing in a fresh strategy per gate.
 */
export const buildPacedUpdate = <TChanges extends object>(args: {
  strategy: BaseStrategy;
  optimistic: (changes: TChanges) => void;
  commit: (mergedChanges: TChanges) => Promise<void>;
}): ((changes: TChanges) => Transaction) => {
  const { strategy, optimistic, commit } = args;
  return createPacedMutations<TChanges>({
    onMutate: (changes) => optimistic(changes),
    mutationFn: async ({ transaction }) => {
      const mutation = transaction.mutations[0]!;
      await commit(mutation.changes as TChanges);
    },
    strategy: strategy as Strategy,
  }) as unknown as (changes: TChanges) => Transaction;
};
