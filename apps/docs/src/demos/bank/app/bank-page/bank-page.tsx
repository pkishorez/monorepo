import { Suspense, use, useState } from 'react';
import type { BankStoreKey } from '../../client/bank/index.ts';
import { Bank, type BankProps, type BankShell } from '../../ui/index.ts';
import { LiveBank } from './live-bank.tsx';
import { STORES, storeOf, type Store } from './stores.ts';

export interface BankPageProps {
  readonly store: BankStoreKey;
  readonly debug: boolean;
  readonly onStore: (store: BankStoreKey) => void;
  readonly onDebug: (open: boolean) => void;
}

const noop = () => {};

const booting = (
  shell: BankShell,
  onDebug: (open: boolean) => void,
): BankProps => ({
  shell,
  ledger: {
    ready: false,
    rows: [],
    from: null,
    paging: {
      hasMore: false,
      scrollRef: { current: null },
      moreRef: { current: null },
    },
    count: 0,
    total: 0,
    nameOf: () => null,
    activity: new Map(),
    fromId: null,
    toId: null,
    onChoose: noop,
    onClear: noop,
    onDropReceiver: noop,
    onSwap: noop,
    onSend: noop,
  },
  history: { viewingId: null, viewing: null, viewed: [], onView: noop },
  attempts: { attempts: [], onRetry: noop },
  admin: null,
  diagnostics: { debug: null, onDebug, onTraces: noop },
});

function BootedBank(props: {
  choice: Store;
  shell: BankShell;
  debug: boolean;
  onDebug: (open: boolean) => void;
}) {
  const runtime = use(props.choice.boot());
  return (
    <LiveBank
      shell={props.shell}
      debug={props.debug}
      onDebug={props.onDebug}
      runtime={runtime}
    />
  );
}

export function BankPage({
  store: initial,
  debug,
  onStore,
  onDebug,
}: BankPageProps) {
  const [store, setStore] = useState<BankStoreKey>(initial);
  const choice = storeOf(store);
  const shell: BankShell = {
    stores: STORES,
    store,
    backHref: '/demos',
    onStore: (value) => {
      const next = value as BankStoreKey;
      if (next === store) return;
      setStore(next);
      onStore(next);
    },
  };
  return (
    <Suspense fallback={<Bank {...booting(shell, onDebug)} />}>
      <BootedBank
        key={store}
        choice={choice}
        shell={shell}
        debug={debug}
        onDebug={onDebug}
      />
    </Suspense>
  );
}
