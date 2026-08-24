import type { ReactNode } from 'react';
import { cn } from '@monorepo/frontend/lib/utils';
import { formatMoney } from '../ledger/money.ts';
import { eyebrow, mono, textLink } from '../shared.ts';

export interface DebugFailure {
  readonly id: string;
  readonly fromName: string;
  readonly toName: string;
  readonly amount: number;
  readonly message: string;
}

export interface DebugPanelProps {
  readonly networks: readonly string[];
  readonly network: string;
  readonly onNetwork: (quality: string) => void;
  readonly ws: {
    readonly status: 'connecting' | 'connected' | 'reconnecting';
    readonly reconnects: number;
  } | null;
  readonly leadership: readonly {
    readonly collection: string;
    readonly partitionKey: string;
    readonly state: 'waiting' | 'leading';
  }[];
  readonly queued: number;
  readonly committing: number;
  readonly failed: readonly DebugFailure[];
  readonly onRetry: (id: string) => void;
  readonly onForget: () => void;
}

const value = cn(mono, 'text-sm text-foreground');

function Count({
  count,
  label,
  tone = 'text-foreground',
}: {
  count: number;
  label: string;
  tone?: string;
}) {
  return (
    <span
      className={cn(
        'flex items-baseline gap-1',
        count === 0 ? 'text-muted-foreground/50' : tone,
      )}
    >
      <span className={mono}>{count}</span>
      <span className="font-sans text-xs tracking-normal normal-case">
        {label}
      </span>
    </span>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className={eyebrow}>{label}</span>
      <span className={cn(value, 'flex items-center gap-1.5 truncate')}>
        {children}
      </span>
    </div>
  );
}

const partitionLabel = (partitionKey: string) => {
  if (partitionKey === '__total__') return 'all';
  const parsed: unknown = JSON.parse(partitionKey);
  return Array.isArray(parsed)
    ? parsed
        .map(
          ([field, , value]: [string, string, unknown]) =>
            `${field}=${String(value)}`,
        )
        .join(' ')
    : partitionKey;
};

function Leases({ leases }: { leases: DebugPanelProps['leadership'] }) {
  if (leases.length === 0)
    return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      {leases.map((lease) => (
        <span
          key={`${lease.collection}|${lease.partitionKey}`}
          className="flex items-baseline gap-2 truncate"
        >
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 self-center rounded-full',
              lease.state === 'leading'
                ? 'bg-primary'
                : 'bg-muted-foreground/40',
            )}
          />
          <span className="truncate">
            {lease.collection}
            <span className="ml-1.5 text-muted-foreground">
              {partitionLabel(lease.partitionKey)}
            </span>
          </span>
          <span className="ml-auto font-sans text-xs tracking-normal text-muted-foreground normal-case">
            {lease.state === 'leading' ? 'leader' : 'follower'}
          </span>
        </span>
      ))}
    </span>
  );
}

function Link({ ws }: { ws: DebugPanelProps['ws'] }) {
  if (ws === null)
    return <span className="text-muted-foreground">in-process</span>;
  return (
    <>
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          ws.status === 'connected' && 'bg-primary',
          ws.status === 'reconnecting' && 'bg-destructive',
          ws.status === 'connecting' && 'bg-muted-foreground/40',
        )}
      />
      <span className="truncate">{ws.status}</span>
      <span className="text-muted-foreground">↻{ws.reconnects}</span>
    </>
  );
}

export function DebugPanel({
  debug,
  onTraces,
  onClose,
}: {
  debug: DebugPanelProps;
  onTraces: () => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="Diagnostics"
      className="flex flex-col gap-4 border-t border-border/60 pt-4"
    >
      <div className="flex items-baseline justify-between">
        <span className={eyebrow}>Diagnostics</span>
        <span className="flex items-baseline gap-4">
          <button
            type="button"
            onClick={debug.onForget}
            className={cn(textLink, eyebrow, 'hover:text-foreground')}
          >
            Clear cache
          </button>
          <button
            type="button"
            onClick={onTraces}
            className={cn(textLink, eyebrow, 'hover:text-foreground')}
          >
            Flows
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(textLink, eyebrow, 'hover:text-foreground')}
          >
            Close
          </button>
        </span>
      </div>
      <div className="flex max-h-[40svh] min-h-0 flex-col gap-4 overflow-y-auto [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Stat label="Network">
            <span className="flex gap-3">
              {debug.networks.map((quality) => (
                <button
                  key={quality}
                  type="button"
                  onClick={() => debug.onNetwork(quality)}
                  className={cn(
                    textLink,
                    quality === debug.network
                      ? 'text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {quality}
                </button>
              ))}
            </span>
          </Stat>
          <Stat label="Link">
            <Link ws={debug.ws} />
          </Stat>
          <div className="col-span-2 sm:col-span-3">
            <Stat label="Sync leases">
              <Leases leases={debug.leadership} />
            </Stat>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <Stat label="Transfers">
              <span className="flex flex-wrap items-baseline gap-x-4">
                <Count count={debug.committing} label="committing" />
                <Count count={debug.queued} label="queued" />
                <Count
                  count={debug.failed.length}
                  label="failed"
                  tone="text-destructive"
                />
              </span>
            </Stat>
          </div>
        </div>
        {debug.failed.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {debug.failed.map((failure) => (
              <li
                key={failure.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 text-sm"
              >
                <span className="truncate">
                  {failure.fromName} → {failure.toName}
                  <span className={cn(mono, 'ml-2 text-muted-foreground')}>
                    {formatMoney(failure.amount)}
                  </span>
                  {failure.message !== '' && (
                    <span className="ml-2 text-xs text-muted-foreground/60">
                      {failure.message}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => debug.onRetry(failure.id)}
                  className={cn(
                    textLink,
                    'text-xs text-foreground underline underline-offset-4 hover:text-primary',
                  )}
                >
                  Retry
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
