import { Effect } from 'effect';
import { inMemoryLeadership } from 'std-toolkit/sync/leadership/in-memory';
import { BANK_RPC_PATH } from '../contract/index.ts';
import { runBank, salt, type BankRuntime, type BankWiring } from './wiring.ts';

const httpWiring: Effect.Effect<BankWiring> = Effect.sync(() => ({
  fetchImpl: (input, init) => fetch(input, init),
  url: BANK_RPC_PATH,
  syncName: `bank-http-${salt()}`,
  storeLayer: undefined,
  leadershipLayer: inMemoryLeadership(),
}));

let runtime: Promise<BankRuntime> | undefined;

export const httpBank = (): Promise<BankRuntime> =>
  (runtime ??= runBank(httpWiring));
