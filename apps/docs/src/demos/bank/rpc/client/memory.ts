import { Effect } from 'effect';
import { Memory } from 'std-toolkit/db/memory';
import { inMemoryLeadership } from 'std-toolkit/sync/leadership/in-memory';
import { bankTable } from '../../std-table/table/index.ts';
import {
  loopback,
  runBank,
  salt,
  type BankRuntime,
  type BankWiring,
} from './wiring.ts';

const memoryWiring: Effect.Effect<BankWiring> = Effect.gen(function* () {
  const table = Memory.make(bankTable).layer;
  return {
    ...loopback(table),
    syncName: `bank-memory-${salt()}`,
    storeLayer: undefined,
    leadershipLayer: inMemoryLeadership(),
  };
});

let runtime: Promise<BankRuntime> | undefined;

export const memoryBank = (): Promise<BankRuntime> =>
  (runtime ??= runBank(memoryWiring));
