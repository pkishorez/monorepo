import { Suspense, use, useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { eq, not, useLiveQuery } from '@tanstack/react-db';
import { useMachine } from '@xstate/react';
import { uTime } from 'std-toolkit/core';
import { Button } from '@monorepo/frontend/components/ui/button';
import { Skeleton } from '@monorepo/frontend/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@monorepo/frontend/components/ui/tabs';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { HomeHeader } from '@/components/home-header';
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
import { AccountList } from '@/demos/bank/ui/account-list';
import { BankSettings } from '@/demos/bank/ui/bank-settings';
import {
  OpenAccountDialog,
  type OpenAccountDraft,
} from '@/demos/bank/ui/open-account-dialog';
import { SendDialog } from '@/demos/bank/ui/send-dialog';
import { Pager } from '@/demos/bank/ui/pager';
import { StoreToggle } from '@/demos/bank/ui/store-toggle';
import {
  Transactions,
  type TransactionLine,
} from '@/demos/bank/ui/transactions';
import {
  TransferStatus,
  type StatusLine,
} from '@/demos/bank/ui/transfer-status';
import { ViewpointCard } from '@/demos/bank/ui/viewpoint-card';

export const Route = createFileRoute('/demos/bank')({
  component: BankPage,
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Bank — a live demo of std-toolkit' },
      {
        name: 'description',
        content:
          'Bank as anyone, send money to anyone. Every transfer moves two balances and writes one row in a single atomic commit — optimistically on screen, then confirmed.',
      },
    ],
  }),
});

type StoreKey = 'memory' | 'idb' | 'dynamo' | 'sqlite';

const PAGE_SIZE = 6;
const TX_PAGE_SIZE = 7;

const FRAME = 'flex min-h-[28.5rem] flex-col';

const STORES: ReadonlyArray<{
  value: StoreKey;
  label: string;
  boot: () => Promise<BankRuntime>;
}> = [
  { value: 'memory', label: 'In-memory', boot: memoryBank },
  { value: 'idb', label: 'IndexedDB', boot: idbBank },
  { value: 'dynamo', label: 'DynamoDB', boot: dynamoBank },
  { value: 'sqlite', label: 'SQLite (DO)', boot: sqliteBank },
];

const NETWORKS: ReadonlyArray<{ value: NetworkQuality; label: string }> = [
  { value: 'fast', label: 'Fast' },
  { value: 'slow', label: 'Slow' },
  { value: 'offline', label: 'Offline' },
];

interface Live {
  readonly $synced?: boolean;
}

const timeOf = (ulid: string): string => {
  const ms = uTime(ulid);
  return ms === null
    ? ''
    : new Date(ms).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
};

function BankPage() {
  const [store, setStore] = useState<StoreKey>('memory');

  return (
    <HomeLayout
      {...baseOptions()}
      searchToggle={{ enabled: false }}
      slots={{ header: HomeHeader }}
    >
      <main className="mx-auto w-full max-w-md flex-1 px-5 py-12 sm:px-6 sm:py-20 lg:max-w-lg">
        <Suspense fallback={<BootingSkeleton />}>
          <BootedBank key={store} store={store} onStoreChange={setStore} />
        </Suspense>
      </main>
    </HomeLayout>
  );
}

function BootingSkeleton() {
  return (
    <>
      <header className="flex h-9 items-center justify-between gap-3">
        <Skeleton className="h-7 w-24" />
        <div className="flex items-center gap-1">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="size-8" />
        </div>
      </header>
      <div className="mt-10 space-y-6">
        <Skeleton className="h-[9.25rem] w-full rounded-xl" />
        <div className="space-y-2">
          <div className="flex h-9 items-center justify-between gap-3">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="min-h-[28.5rem] w-full rounded-lg" />
        </div>
      </div>
    </>
  );
}

function BootedBank({
  store,
  onStoreChange,
}: {
  store: StoreKey;
  onStoreChange: (store: StoreKey) => void;
}) {
  const runtime = use(STORES.find((option) => option.value === store)!.boot());
  return <Bank store={store} onStoreChange={onStoreChange} runtime={runtime} />;
}

function Bank({
  store,
  onStoreChange,
  runtime,
}: {
  store: StoreKey;
  onStoreChange: (store: StoreKey) => void;
  runtime: BankRuntime;
}) {
  const [network, setNetwork] = useState<NetworkQuality>('fast');
  const [opening, setOpening] = useState(false);
  const [page, setPage] = useState(0);
  const [txPage, setTxPage] = useState(0);
  const [tab, setTab] = useState<'people' | 'transactions'>('people');

  const [state, send] = useMachine(journeyMachine, {
    input: {
      send: (request) => runtime.sendMoney(request).isPersisted.promise,
    },
  });

  const { viewpointId, peerId } = state.context;

  const { data: allRows } = useLiveQuery(() => runtime.accounts);
  const { data: transferRows } = useLiveQuery(() => runtime.transfers);

  const rows = (allRows ?? []) as ReadonlyArray<Account & Live>;
  const banking = rows.some((account) => account.id === viewpointId);
  const pages = Math.max(
    1,
    Math.ceil((rows.length - (banking ? 1 : 0)) / PAGE_SIZE),
  );
  const peerPage = Math.min(page, pages - 1);

  const { data: pageRows } = useLiveQuery(
    (q) =>
      q
        .from({ account: runtime.accounts })
        .where(({ account }) => not(eq(account.id, viewpointId ?? '')))
        .orderBy(({ account }) => account.balance, 'desc')
        .offset(peerPage * PAGE_SIZE)
        .limit(PAGE_SIZE),
    [viewpointId, peerPage],
  );

  const all = rows;
  const peers = (pageRows ?? []) as ReadonlyArray<Account & Live>;
  const viewpoint = all.find((account) => account.id === viewpointId);

  const lines = useMemo<TransactionLine[]>(() => {
    if (viewpointId === null) return [];
    const nameOf = new Map(
      ((allRows ?? []) as ReadonlyArray<Account>).map((a) => [a.id, a.name]),
    );
    return ((transferRows ?? []) as ReadonlyArray<Transfer & Live>)
      .filter((t) => t.from === viewpointId || t.to === viewpointId)
      .sort((a, b) => b.id.localeCompare(a.id))
      .map((t) => {
        const sent = t.from === viewpointId;
        const counterpartyId = sent ? t.to : t.from;
        return {
          id: t.id,
          direction: sent ? ('sent' as const) : ('received' as const),
          counterpartyId,
          counterpartyName: nameOf.get(counterpartyId) ?? 'a closed account',
          amount: t.amount,
          at: timeOf(t.id),
        };
      });
  }, [transferRows, allRows, viewpointId]);

  const openAccount = (draft: OpenAccountDraft) => {
    const id = newId();
    runtime.accounts.insert({
      id,
      name: draft.name.trim().replace(/\s+/g, ' '),
      balance: draft.balance,
    });
    setOpening(false);
    send({ type: 'BANK_AS', accountId: id });
  };

  const seed = () => runtime.seed();

  const changeNetwork = (quality: NetworkQuality) => {
    setNetwork(quality);
    runtime.network.set(quality);
  };

  const header = (
    <header className="flex h-9 items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">
        <button
          type="button"
          onClick={() => send({ type: 'SWITCH' })}
          className="rounded-sm outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Bank
        </button>
      </h1>
      <div className="flex items-center gap-1">
        <StoreToggle
          stores={STORES}
          store={store}
          onChange={(value) => onStoreChange(value as StoreKey)}
        />
        <BankSettings
          networks={NETWORKS}
          network={network}
          onNetworkChange={(value) => changeNetwork(value as NetworkQuality)}
          onSeed={seed}
        />
      </div>
    </header>
  );

  const dialog = (
    <OpenAccountDialog
      open={opening}
      onOpenChange={setOpening}
      onOpen={openAccount}
    />
  );

  if (all.length === 0)
    return (
      <>
        {header}
        <section
          className={`mt-10 flex flex-col items-center justify-center gap-4 ${FRAME}`}
        >
          <p className="text-sm text-muted-foreground">No accounts</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={seed} className="gap-2">
              Seed accounts
            </Button>
            <Button variant="outline" onClick={() => setOpening(true)}>
              Create account
            </Button>
          </div>
        </section>
        {dialog}
      </>
    );

  const peerPager = <Pager page={peerPage} pages={pages} onPage={setPage} />;

  if (viewpoint === undefined)
    return (
      <>
        {header}
        <section className="mt-10 space-y-2">
          <div className="flex h-9 items-center justify-between gap-3">
            <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Bank as
            </h2>
            {peerPager}
          </div>
          <div className={FRAME}>
            <AccountList
              accounts={peers}
              slots={PAGE_SIZE}
              action="Bank as"
              openLabel="Open an account"
              onPick={(accountId) => send({ type: 'BANK_AS', accountId })}
              onOpenAccount={() => setOpening(true)}
            />
          </div>
        </section>
        {dialog}
      </>
    );

  const composing =
    typeof state.value === 'object' &&
    (state.value as Record<string, unknown>).banking === 'composing';

  const peer = composing
    ? (all.find((account) => account.id === peerId) ?? null)
    : null;

  const txPages = Math.max(1, Math.ceil(lines.length / TX_PAGE_SIZE));
  const txPageIndex = Math.min(txPage, txPages - 1);
  const txLines = lines.slice(
    txPageIndex * TX_PAGE_SIZE,
    txPageIndex * TX_PAGE_SIZE + TX_PAGE_SIZE,
  );

  const statusLines: StatusLine[] = Object.values(state.context.flights)
    .filter(
      (flight) => flight.from === viewpoint.id || flight.to === viewpoint.id,
    )
    .map((flight) => ({
      id: flight.id,
      phase: flight.phase,
      message: flight.problem?.message ?? null,
    }));

  return (
    <>
      {header}

      <div className="mt-10 space-y-6">
        <ViewpointCard
          account={viewpoint}
          onSwitch={() => send({ type: 'SWITCH' })}
          status={
            <TransferStatus
              lines={statusLines}
              onRetry={(id) => send({ type: 'RETRY', id })}
              onDismiss={(id) => send({ type: 'DISMISS', id })}
            />
          }
        />

        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTab((value ?? tab) as 'people' | 'transactions')
          }
          className="gap-2"
        >
          <div className="flex h-9 items-center justify-between gap-3">
            <TabsList variant="line">
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>
            {tab === 'people' ? (
              peerPager
            ) : (
              <Pager page={txPageIndex} pages={txPages} onPage={setTxPage} />
            )}
          </div>
          <TabsContent value="people" className={FRAME}>
            <AccountList
              accounts={peers}
              slots={PAGE_SIZE}
              action="Send money to"
              openLabel="Open another account"
              onPick={(accountId) =>
                send({ type: 'COMPOSE', peerId: accountId })
              }
              onOpenAccount={() => setOpening(true)}
            />
          </TabsContent>
          <TabsContent value="transactions" className={FRAME}>
            <Transactions
              lines={txLines}
              slots={TX_PAGE_SIZE}
              onBankAs={(accountId) => send({ type: 'BANK_AS', accountId })}
            />
          </TabsContent>
        </Tabs>
      </div>

      <SendDialog
        peer={peer}
        available={viewpoint.balance}
        onSend={(amount) => send({ type: 'SEND', amount })}
        onDismiss={() => send({ type: 'CANCEL' })}
      />
      {dialog}
    </>
  );
}
