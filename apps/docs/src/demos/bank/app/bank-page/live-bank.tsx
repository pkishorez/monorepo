import { useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import { count, eq, not, sum, useLiveQuery } from '@tanstack/react-db';
import { DevToolsPanel } from '@monorepo/frontend/components/blocks/devtools-panel';
import type { Account } from '../../contract/account/index.ts';
import type { Transfer } from '../../contract/transfer/index.ts';
import {
  NETWORK_QUALITIES,
  type BankRuntime,
  type NetworkQuality,
} from '../../client/bank/index.ts';
import {
  Bank,
  usePaging,
  type Activity,
  type BankShell,
} from '../../ui/index.ts';
import {
  EMPTY_DRAFT,
  receiverOf,
  reduceDraft,
  senderOf,
} from '../draft/index.ts';

const EMPTY: readonly never[] = [];

const useSide = (
  runtime: BankRuntime,
  side: 'from' | 'to',
  id: string | null,
): readonly Transfer[] => {
  const { data } = useLiveQuery(
    (q) =>
      id === null
        ? null
        : q
            .from({ t: runtime.transfers })
            .where(({ t }) => eq(side === 'from' ? t.from : t.to, id)),
    [id, side],
  );
  return (data ?? EMPTY) as readonly Transfer[];
};

const useHistory = (runtime: BankRuntime, id: string | null) => {
  const sent = useSide(runtime, 'from', id);
  const received = useSide(runtime, 'to', id);
  return useMemo(
    () => [...sent, ...received].sort((a, b) => (a.id < b.id ? 1 : -1)),
    [sent, received],
  );
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

const useAccount = (
  runtime: BankRuntime,
  id: string | null,
): Account | null => {
  const { data } = useLiveQuery(
    (q) =>
      id === null
        ? null
        : q.from({ a: runtime.accounts }).where(({ a }) => eq(a.id, id)),
    [id],
  );
  return (data?.[0] ?? null) as Account | null;
};

const useReady = (runtime: BankRuntime): boolean =>
  useSyncExternalStore(
    (onChange) => runtime.accounts.on('status:change', onChange),
    () => runtime.accounts.isReady(),
  );

const useSummary = (runtime: BankRuntime) => {
  const { data } = useLiveQuery((q) =>
    q
      .from({ a: runtime.accounts })
      .select(({ a }) => ({ total: sum(a.balance), n: count(a.id) })),
  );
  return { total: data?.[0]?.total ?? 0, count: data?.[0]?.n ?? 0 };
};

// Newest accounts first, paged on the indexed `id` (a ULID): a unique sort key is what
// lets TanStack page from the index in milliseconds and without repeats. The query
// re-evaluates on every commit, so it only exists once the collection is ready.
const useNewest = (
  runtime: BankRuntime,
  enabled: boolean,
  offset: number,
  limit: number,
  excludeId: string | null,
): readonly Account[] => {
  const { data } = useLiveQuery(
    (q) =>
      !enabled
        ? null
        : q
            .from({ a: runtime.accounts })
            .where(({ a }) => not(eq(a.id, excludeId ?? '')))
            .orderBy(({ a }) => a.id, 'desc')
            .offset(offset)
            .limit(limit),
    [enabled, offset, limit, excludeId],
  );
  return (data ?? EMPTY) as readonly Account[];
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

  const fromId = senderOf(draft);
  const toId = receiverOf(draft);
  const ready = useReady(runtime);
  const summary = useSummary(runtime);
  const from = useAccount(runtime, fromId);
  const viewing = useAccount(runtime, viewingId);
  const { offset, limit, ...paging } = usePaging(
    summary.count - (from === null ? 0 : 1),
  );
  const rows = useNewest(runtime, ready, offset, limit, fromId);
  const viewed = useHistory(runtime, viewingId);
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

  const fromActivity = useActivity(runtime, fromId);
  const toActivity = useActivity(runtime, toId);
  const activity = useMemo(() => {
    const byId = new Map<string, Activity>();
    if (fromId !== null) byId.set(fromId, fromActivity);
    if (toId !== null) byId.set(toId, toActivity);
    return byId;
  }, [fromId, toId, fromActivity, toActivity]);
  const admin = useSyncExternalStore(
    runtime.admin.subscribe,
    runtime.admin.get,
  );

  return (
    <>
      <Bank
        shell={shell}
        ledger={{
          ready,
          rows,
          from,
          paging,
          count: summary.count,
          total: summary.total,
          nameOf: (id) => runtime.accounts.get(id)?.name ?? null,
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
          viewing,
          viewed,
          onView: setViewingId,
        }}
        attempts={{ attempts, onRetry: runtime.retry }}
        admin={
          admin === null
            ? null
            : {
                onOpen: (opening) => void admin.open(opening),
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
                leadership: vitals.leadership,
                queued: vitals.queued,
                committing: vitals.committing,
                onForget: () =>
                  void runtime.diagnostics
                    .forget()
                    .then(() => location.reload()),
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
