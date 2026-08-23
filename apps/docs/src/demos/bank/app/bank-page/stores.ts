import {
  bank,
  type BankRuntime,
  type BankStoreKey,
} from '../../client/bank/index.ts';
import type { StoreChoice } from '../../ui/index.ts';

export interface Store extends StoreChoice {
  readonly value: BankStoreKey;
  readonly boot: () => Promise<BankRuntime>;
}

export const STORES: readonly Store[] = [
  {
    value: 'idb',
    label: 'IndexedDB',
    reach: 'this browser · push',
    boot: bank.idb,
  },
  {
    value: 'dynamo',
    label: 'DynamoDB',
    reach: 'everyone · poll',
    boot: bank.dynamo,
  },
  {
    value: 'sqlite',
    label: 'Durable Object',
    reach: 'everyone · push',
    boot: bank.sqlite,
  },
];

export const isStoreKey = (value: unknown): value is BankStoreKey =>
  STORES.some((store) => store.value === value);

export const storeOf = (key: BankStoreKey): Store =>
  STORES.find((store) => store.value === key) ?? STORES[0]!;
