import {
  Suspense,
  startTransition,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
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
  newId,
  type BankRuntime,
  type BankVitals,
  type NetworkQuality,
} from '@/demos/bank/rpc/client';
import { Bank, type BankAttempt, type BankStore } from '@/demos/bank/ui/bank';

const STORE_KEYS = ['idb', 'dynamo', 'sqlite'] as const;

type StoreKey = (typeof STORE_KEYS)[number];

const isStoreKey = (value: unknown): value is StoreKey =>
  STORE_KEYS.includes(value as StoreKey);

export const Route = createFileRoute('/demos/bank')({
  component: BankPage,
  ssr: false,
  validateSearch: (
    search: { store?: StoreKey; debug?: boolean } & SearchSchemaInput,
  ): { store: StoreKey; debug?: boolean } => ({
    store: isStoreKey(search.store) ? search.store : 'idb',
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

const REFUSAL_LINGER_MS = 5000;

const leadershipOf = (vitals: BankVitals): 'leader' | 'follower' | null => {
  const states = Object.values(vitals.leadership);
  if (states.length === 0) return null;
  return states.some((state) => state === 'waiting') ? 'follower' : 'leader';
};

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
  onSwap: noop,
  onSend: noop,
  onOpen: noop,
  onRetry: noop,
  onDebug: noop,
} as const;

function BankPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [store, setStore] = useState<StoreKey>(search.store);

  const switchStore = (next: StoreKey) => {
    if (next === store) return;
    startTransition(() => setStore(next));
    void navigate({ search: { ...search, store: next }, replace: true });
  };

  const choice = STORES.find((option) => option.value === store)!;
  const shell = {
    stores: STORES,
    store,
    onStore: (value: string) => switchStore(value as StoreKey),
    backHref: '/demos',
    debug: search.debug === true,
    onDebug: (open: boolean) =>
      void navigate({
        search: { store: search.store, ...(open ? { debug: true } : {}) },
        replace: true,
      }),
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
  readonly onStore: (value: string) => void;
  readonly backHref: string;
  readonly debug: boolean;
  readonly onDebug: (open: boolean) => void;
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

  const vitals = useSyncExternalStore(
    runtime.vitals.subscribe,
    runtime.vitals.get,
  );

  useEffect(() => {
    const refusals = Object.values(flights).filter(
      (flight) => flight.phase === 'refused',
    );
    if (refusals.length === 0) return;
    const timer = setTimeout(
      () =>
        refusals.forEach((flight) => send({ type: 'DISMISS', id: flight.id })),
      REFUSAL_LINGER_MS,
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
      onStore={shell.onStore}
      backHref={shell.backHref}
      accounts={(accountRows ?? EMPTY) as ReadonlyArray<Account>}
      transfers={(transferRows ?? EMPTY) as ReadonlyArray<Transfer>}
      attempts={attempts}
      fromId={fromId}
      toId={toId}
      onPick={(accountId) => send({ type: 'PICK', accountId })}
      onCancel={() => send({ type: 'CANCEL' })}
      onUntarget={() => send({ type: 'UNTARGET' })}
      onSwap={() => send({ type: 'SWAP' })}
      onSend={(amount, stay) => send({ type: 'SEND', amount, stay })}
      onOpen={(opening) => {
        const id = newId();
        runtime.accounts.insert({
          id,
          name: opening.name,
          balance: opening.balance,
        });
        send({ type: 'CANCEL' });
        send({ type: 'PICK', accountId: id });
      }}
      onRetry={(id) => send({ type: 'RETRY', id })}
      onDebug={shell.onDebug}
      debug={
        shell.debug
          ? {
              networks: NETWORKS,
              network,
              onNetwork: (quality) => {
                setNetwork(quality as NetworkQuality);
                runtime.network.set(quality as NetworkQuality);
              },
              ws: vitals.ws,
              leadership: leadershipOf(vitals),
              queued: vitals.queued,
              committing: vitals.committing,
            }
          : null
      }
    />
  );
}
