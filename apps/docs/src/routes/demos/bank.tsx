import { Suspense, use, useMemo, useState } from 'react';
import { ArrowLeft, Landmark } from 'lucide-react';
import {
  createFileRoute,
  Link,
  type SearchSchemaInput,
} from '@tanstack/react-router';
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
import { StoreToggle } from '@/demos/bank/ui/store-toggle';
import {
  Transactions,
  type TransactionLine,
} from '@/demos/bank/ui/transactions';
import {
  TransferStatus,
  type StatusLine,
} from '@/demos/bank/ui/transfer-status';
import {
  ViewpointCard,
  ViewpointPlaceholder,
} from '@/demos/bank/ui/viewpoint-card';

const STORE_KEYS = ['memory', 'idb', 'dynamo', 'sqlite'] as const;

type StoreKey = (typeof STORE_KEYS)[number];

const isStoreKey = (value: unknown): value is StoreKey =>
  STORE_KEYS.includes(value as StoreKey);

export const Route = createFileRoute('/demos/bank')({
  component: BankPage,
  ssr: false,
  validateSearch: (
    search: { store?: StoreKey } & SearchSchemaInput,
  ): { store: StoreKey } => ({
    store: isStoreKey(search.store) ? search.store : 'memory',
  }),
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

const SCROLL = '-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2';

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
  const { store } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setStore = (next: StoreKey) =>
    navigate({ search: { store: next }, replace: true });

  return (
    <>
      <main className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden px-5 py-6 sm:px-6 sm:py-8 lg:max-w-lg">
        <Suspense fallback={<BootingSkeleton />}>
          <BootedBank key={store} store={store} onStoreChange={setStore} />
        </Suspense>
      </main>
      <div className="fixed inset-0 z-60 hidden items-center justify-center bg-background px-8 text-center [@media(max-height:479px)]:flex">
        <div className="max-w-xs space-y-2">
          <p className="text-base font-semibold">This window is too short</p>
          <p className="text-sm text-muted-foreground">
            The bank fits on one screen without scrolling — give the window a
            bit more height.
          </p>
        </div>
      </div>
    </>
  );
}

function BootingSkeleton() {
  return (
    <>
      <header className="flex h-9 items-center justify-between gap-3">
        <Skeleton className="h-7 w-32" />
        <div className="flex items-center gap-1">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="size-8" />
        </div>
      </header>
      <Skeleton className="mt-4 h-[4.75rem] w-full shrink-0 rounded-xl" />
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex h-9 shrink-0 items-center">
          <Skeleton className="h-5 w-44" />
        </div>
        <Skeleton className="min-h-0 w-full flex-1 rounded-lg" />
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

  const { data: pageRows } = useLiveQuery(
    (q) =>
      q
        .from({ account: runtime.accounts })
        .where(({ account }) => not(eq(account.id, viewpointId ?? '')))
        .orderBy(({ account }) => account.balance, 'desc'),
    [viewpointId],
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
      <div className="flex items-center gap-1.5">
        <Link
          to="/demos"
          aria-label="Back to demos"
          className="-ml-2 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Bank</h1>
      </div>
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
        <section className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Landmark className="size-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold">
              A bank with no accounts
            </h2>
            <p className="mt-1 max-w-72 text-sm text-muted-foreground">
              Seed a few people to send money between, or open an account of
              your own.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={seed}>Seed accounts</Button>
              <Button variant="outline" onClick={() => setOpening(true)}>
                Open an account
              </Button>
            </div>
          </div>
        </section>
        {dialog}
      </>
    );

  if (viewpoint === undefined)
    return (
      <>
        {header}
        <div className="mt-4 shrink-0">
          <ViewpointPlaceholder />
        </div>
        <section className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex h-9 shrink-0 items-center">
            <h2 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Bank as
            </h2>
          </div>
          <div className={SCROLL}>
            <AccountList
              accounts={peers}
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

  const statusLines: StatusLine[] = Object.values(state.context.flights)
    .filter(
      (flight) => flight.from === viewpoint.id || flight.to === viewpoint.id,
    )
    .map((flight) => {
      const counterpartyId =
        flight.from === viewpoint.id ? flight.to : flight.from;
      return {
        id: flight.id,
        phase: flight.phase,
        message: flight.problem?.message ?? null,
        amount: flight.amount,
        attempt: flight.attempt,
        counterpartyName:
          all.find((account) => account.id === counterpartyId)?.name ??
          'a closed account',
      };
    });

  return (
    <>
      {header}

      <div className="mt-4 shrink-0">
        <ViewpointCard
          account={viewpoint}
          accounts={[...all].sort((a, b) => b.balance - a.balance)}
          onBankAs={(accountId) => send({ type: 'BANK_AS', accountId })}
          onOpenAccount={() => setOpening(true)}
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setTab((value ?? tab) as 'people' | 'transactions')
        }
        className="mt-4 flex min-h-0 flex-1 flex-col gap-2"
      >
        <div className="flex h-9 shrink-0 items-center">
          <TabsList variant="line">
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="people" className={SCROLL}>
          <AccountList
            accounts={peers}
            action="Send money to"
            openLabel="Open another account"
            onPick={(accountId) => send({ type: 'COMPOSE', peerId: accountId })}
            onOpenAccount={() => setOpening(true)}
          />
        </TabsContent>
        <TabsContent value="transactions" className={SCROLL}>
          <Transactions lines={lines} />
        </TabsContent>
      </Tabs>

      <TransferStatus
        lines={statusLines}
        onRetry={(id) => send({ type: 'RETRY', id })}
        onDismiss={(id) => send({ type: 'DISMISS', id })}
      />
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
