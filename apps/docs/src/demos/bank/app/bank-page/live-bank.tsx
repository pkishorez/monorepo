import { useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import { count, eq, or, useLiveQuery } from '@tanstack/react-db';
import { DevToolsPanel } from '@monorepo/frontend/components/blocks/devtools-panel';
import type { Account } from '../../contract/account/index.ts';
import type { Transfer } from '../../contract/transfer/index.ts';
import {
  NETWORK_QUALITIES,
  type BankRuntime,
  type BankVitals,
  type NetworkQuality,
} from '../../client/bank/index.ts';
import { Bank, type Activity, type BankShell } from '../../ui/index.ts';
import {
  EMPTY_DRAFT,
  receiverOf,
  reduceDraft,
  senderOf,
} from '../draft/index.ts';

const EMPTY: readonly never[] = [];

const leadershipOf = (vitals: BankVitals): 'leader' | 'follower' | null => {
  const states = Object.values(vitals.leadership);
  if (states.length === 0) return null;
  return states.some((state) => state === 'waiting') ? 'follower' : 'leader';
};

const useCount = (
  runtime: BankRuntime,
  side: 'from' | 'to',
  id: string | null,
): number => {
  const { data } = useLiveQuery(
    (q) =>
      id === null
        ? null
        : q
            .from({ t: runtime.transfers })
            .where(({ t }) => eq(side === 'from' ? t.from : t.to, id))
            .select(({ t }) => ({ n: count(t.id) })),
    [id, side],
  );
  return data?.[0]?.n ?? 0;
};

const useActivity = (runtime: BankRuntime, id: string | null): Activity => {
  const sent = useCount(runtime, 'from', id);
  const received = useCount(runtime, 'to', id);
  return useMemo(() => ({ sent, received }), [sent, received]);
};

export interface LiveBankProps {
  readonly shell: BankShell;
  readonly debug: boolean;
  readonly onDebug: (open: boolean) => void;
  readonly runtime: BankRuntime;
}

export function LiveBank({ shell, debug, onDebug, runtime }: LiveBankProps) {
  const [draft, dispatch] = useReducer(reduceDraft, EMPTY_DRAFT);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [traces, setTraces] = useState(false);

  const { data: accountRows } = useLiveQuery(() => runtime.accounts);
  const { data: totals } = useLiveQuery((q) =>
    q
      .from({ t: runtime.transfers })
      .select(({ t }) => ({ transfers: count(t.id) })),
  );
  const { data: viewed } = useLiveQuery(
    (q) =>
      viewingId === null
        ? null
        : q
            .from({ t: runtime.transfers })
            .where(({ t }) => or(eq(t.from, viewingId), eq(t.to, viewingId)))
            .orderBy(({ t }) => t.id, 'desc'),
    [viewingId],
  );
  const attempts = useSyncExternalStore(
    runtime.attempts.subscribe,
    runtime.attempts.get,
  );
  const vitals = useSyncExternalStore(
    runtime.diagnostics.vitals.subscribe,
    runtime.diagnostics.vitals.get,
  );
  const network = useSyncExternalStore(
    runtime.diagnostics.network.quality.subscribe,
    runtime.diagnostics.network.quality.get,
  );

  const fromId = senderOf(draft);
  const toId = receiverOf(draft);
  const fromActivity = useActivity(runtime, fromId);
  const toActivity = useActivity(runtime, toId);
  const activity = useMemo(() => {
    const byId = new Map<string, Activity>();
    if (fromId !== null) byId.set(fromId, fromActivity);
    if (toId !== null) byId.set(toId, toActivity);
    return byId;
  }, [fromId, toId, fromActivity, toActivity]);
  const admin = runtime.admin;

  return (
    <>
      <Bank
        shell={shell}
        ledger={{
          accounts: (accountRows ?? EMPTY) as ReadonlyArray<Account>,
          transferCount: totals?.[0]?.transfers ?? 0,
          activity,
          fromId,
          toId,
          onChoose: (id) => dispatch({ type: 'choose', id }),
          onClear: () => dispatch({ type: 'clear' }),
          onDropReceiver: () => dispatch({ type: 'drop-receiver' }),
          onSwap: () => dispatch({ type: 'swap' }),
          onSend: (amount, stay = false) => {
            if (fromId === null || toId === null) return;
            runtime.send({ from: fromId, to: toId, amount });
            dispatch({ type: 'sent', stay });
          },
        }}
        history={{
          viewingId,
          viewed: (viewed ?? EMPTY) as ReadonlyArray<Transfer>,
          onView: setViewingId,
        }}
        attempts={{ attempts, onRetry: runtime.retry }}
        admin={
          admin === null
            ? null
            : {
                onOpen: (opening) => {
                  const id = admin.open(opening);
                  dispatch({ type: 'clear' });
                  dispatch({ type: 'choose', id });
                },
                onSeed: (n) => void admin.seed(n),
                onClear: () => void admin.clear().then(() => location.reload()),
              }
        }
        diagnostics={{
          debug: debug
            ? {
                networks: NETWORK_QUALITIES,
                network,
                onNetwork: (quality) =>
                  runtime.diagnostics.network.quality.update(
                    () => quality as NetworkQuality,
                  ),
                ws: vitals.ws,
                leadership: leadershipOf(vitals),
                queued: vitals.queued,
                committing: vitals.committing,
              }
            : null,
          onDebug,
          onTraces: () => setTraces(true),
        }}
      />
      <DevToolsPanel
        recorder={runtime.diagnostics.recorder}
        filters={['flows']}
        open={traces}
        onClose={() => setTraces(false)}
      />
    </>
  );
}
