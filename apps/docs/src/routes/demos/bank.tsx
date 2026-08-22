import { Suspense, use, useEffect, useState, useTransition } from 'react';
import {
  createFileRoute,
  type SearchSchemaInput,
} from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { useMachine } from '@xstate/react';
import type { Account } from '@/demos/bank/contract/account';
import type { Transfer } from '@/demos/bank/contract/transfer';
import { journeyMachine } from '@/demos/bank/machine';
import {
  dynamoBank,
  sqliteBank,
  idbBank,
  memoryBank,
  newId,
  type BankRuntime,
  type NetworkQuality,
} from '@/demos/bank/rpc/client';
import { Bank, type BankAttempt, type BankStore } from '@/demos/bank/ui/bank';

const STORE_KEYS = ['memory', 'idb', 'dynamo', 'sqlite'] as const;

type StoreKey = (typeof STORE_KEYS)[number];

const isStoreKey = (value: unknown): value is StoreKey =>
  STORE_KEYS.includes(value as StoreKey);

export const Route = createFileRoute('/demos/bank')({
  component: BankPage,
  ssr: false,
  validateSearch: (
    search: { store?: StoreKey; debug?: boolean } & SearchSchemaInput,
  ): { store: StoreKey; debug?: boolean } => ({
    store: isStoreKey(search.store) ? search.store : 'memory',
    ...(search.debug === true ? { debug: true } : {}),
  }),
  head: () => ({
    meta: [
      { title: 'Bank — a live demo of std-toolkit' },
      {
        name: 'description',
        content:
          'Move money between accounts and watch both balances settle — one atomic commit per transfer, optimistically on screen, over four stores of growing sync radius.',
      },
    ],
  }),
});

interface Store extends BankStore {
  readonly value: StoreKey;
  readonly local: boolean;
  readonly boot: () => Promise<BankRuntime>;
}

const STORES: readonly Store[] = [
  {
    value: 'memory',
    label: 'Memory',
    reach: 'this page · push',
    local: true,
    boot: memoryBank,
  },
  {
    value: 'idb',
    label: 'IndexedDB',
    reach: 'this browser · push',
    local: true,
    boot: idbBank,
  },
  {
    value: 'dynamo',
    label: 'DynamoDB',
    reach: 'everyone · poll',
    local: false,
    boot: dynamoBank,
  },
  {
    value: 'sqlite',
    label: 'Durable Object',
    reach: 'everyone · push',
    local: false,
    boot: sqliteBank,
  },
];

const NETWORKS: readonly NetworkQuality[] = ['fast', 'slow', 'offline'];

const PROBLEM_LINGER_MS = 5000;

const EMPTY: readonly never[] = [];

const noop = () => {};

const BOOTING = {
  debug: null,
  accounts: EMPTY,
  transfers: EMPTY,
  attempts: EMPTY,
  fromId: null,
  toId: null,
  onPick: noop,
  onCancel: noop,
  onUntarget: noop,
  onSend: noop,
  onOpen: noop,
  onRetry: noop,
} as const;

function BankPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [store, setStore] = useState<StoreKey>(search.store);
  const [switching, startSwitch] = useTransition();

  const switchStore = (next: StoreKey) => {
    if (next === store) return;
    startSwitch(() => setStore(next));
    void navigate({ search: { ...search, store: next }, replace: true });
  };

  const choice = STORES.find((option) => option.value === store)!;
  const shell = {
    stores: STORES,
    store,
    switching,
    onStore: (value: string) => switchStore(value as StoreKey),
    debug: search.debug === true,
  };

  return (
    <Suspense fallback={<Bank {...shell} {...BOOTING} />}>
      <BootedBank key={store} choice={choice} shell={shell} />
    </Suspense>
  );
}

interface Shell {
  readonly stores: readonly Store[];
  readonly store: StoreKey;
  readonly switching: boolean;
  readonly onStore: (value: string) => void;
  readonly debug: boolean;
}

function BootedBank({ choice, shell }: { choice: Store; shell: Shell }) {
  const runtime = use(choice.boot());
  return <LiveBank choice={choice} shell={shell} runtime={runtime} />;
}

function LiveBank({
  choice,
  shell,
  runtime,
}: {
  choice: Store;
  shell: Shell;
  runtime: BankRuntime;
}) {
  const [network, setNetwork] = useState<NetworkQuality>(runtime.network.get());

  const [state, send] = useMachine(journeyMachine, {
    input: {
      send: (request) => runtime.sendMoney(request).isPersisted.promise,
    },
  });
  const { fromId, toId, flights } = state.context;

  const { data: accountRows } = useLiveQuery(() => runtime.accounts);
  const { data: transferRows } = useLiveQuery(() => runtime.transfers);

  useEffect(() => {
    if (choice.local) void runtime.seedIfEmpty();
  }, [choice, runtime]);

  useEffect(() => {
    const problems = Object.values(flights).filter(
      (flight) => flight.phase !== 'sending',
    );
    if (problems.length === 0) return;
    const timer = setTimeout(
      () =>
        problems.forEach((flight) => send({ type: 'DISMISS', id: flight.id })),
      PROBLEM_LINGER_MS,
    );
    return () => clearTimeout(timer);
  }, [flights, send]);

  const attempts: BankAttempt[] = Object.values(flights).map((flight) => ({
    id: flight.id,
    from: flight.from,
    to: flight.to,
    amount: flight.amount,
    phase: flight.phase,
    message: flight.problem?.message ?? null,
    attempt: flight.attempt,
  }));

  return (
    <Bank
      stores={shell.stores}
      store={shell.store}
      switching={shell.switching}
      onStore={shell.onStore}
      accounts={(accountRows ?? EMPTY) as ReadonlyArray<Account>}
      transfers={(transferRows ?? EMPTY) as ReadonlyArray<Transfer>}
      attempts={attempts}
      fromId={fromId}
      toId={toId}
      onPick={(accountId) => send({ type: 'PICK', accountId })}
      onCancel={() => send({ type: 'CANCEL' })}
      onUntarget={() => send({ type: 'UNTARGET' })}
      onSend={(amount) => send({ type: 'SEND', amount })}
      onOpen={(opening) =>
        runtime.accounts.insert({
          id: newId(),
          name: opening.name,
          balance: opening.balance,
        })
      }
      onRetry={(id) => send({ type: 'RETRY', id })}
      debug={
        shell.debug
          ? {
              networks: NETWORKS,
              network,
              onNetwork: (quality) => {
                setNetwork(quality as NetworkQuality);
                runtime.network.set(quality as NetworkQuality);
              },
              onSeed: runtime.seed,
            }
          : null
      }
    />
  );
}
