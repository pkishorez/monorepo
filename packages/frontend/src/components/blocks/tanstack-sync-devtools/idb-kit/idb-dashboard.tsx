import { useState } from 'react';
import { Button } from '#components/ui/button';
import { ScrollArea } from '#components/ui/scroll-area';
import { toast } from '#components/ui/sonner';
import {
  DatabaseIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from '#lib/lucide';
import { cn } from '#lib/utils';
import { useIdbStats } from './use-idb-stats';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / 1024 ** exp;
  return `${value >= 100 || exp === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[exp]}`;
}

function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  if (pct === 0) return '0%';
  if (pct < 0.01) return '<0.01%';
  return `${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`;
}

export function IdbDashboard({ active }: { active: boolean }) {
  const {
    dbName,
    persistent,
    dbBytes,
    itemCount,
    usageBytes: usage,
    quotaBytes: quota,
    persisted,
    loading,
    refresh,
    persist,
    clear,
  } = useIdbStats(active);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const fraction = usage != null && quota ? Math.min(usage / quota, 1) : 0;

  const handlePersist = () =>
    persist.mutate(undefined, {
      onSuccess: (granted) =>
        granted
          ? toast.success('IndexedDB is now protected from eviction')
          : toast.error('The browser declined persistent storage'),
      onError: () => toast.error('Could not request persistence'),
    });

  const handleClear = () =>
    clear.mutate(undefined, {
      onSuccess: () => {
        toast.success('Cleared IndexedDB — reload to resync');
        setConfirmingClear(false);
      },
      onError: () => {
        toast.error('Failed to clear IndexedDB');
        setConfirmingClear(false);
      },
    });

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-muted-foreground flex items-center gap-2 text-xs tracking-wide">
            <DatabaseIcon className="size-3.5" />
            <span className="font-mono">{dbName ?? 'in-memory'}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{persistent ? 'IndexedDB' : 'Memory'}</span>
          </p>
          {persistent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => refresh()}
              disabled={loading}
              className="h-7 gap-1.5 text-xs"
            >
              <RefreshCwIcon
                className={cn('size-3.5', loading && 'animate-spin')}
              />
              Refresh
            </Button>
          )}
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          {persistent ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p>
                  <span className="text-chart-2 text-3xl font-light tabular-nums">
                    {formatBytes(dbBytes)}
                  </span>
                  <span className="text-muted-foreground text-sm"> stored</span>
                </p>
                <p className="text-muted-foreground flex items-center gap-1.5 text-sm tabular-nums">
                  {loading && (
                    <RefreshCwIcon className="size-3 animate-spin opacity-70" />
                  )}
                  {itemCount != null ? `${itemCount} entries` : '—'}
                </p>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
                <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                  <span className="tracking-wide uppercase">
                    Origin storage
                  </span>
                  <span className="tabular-nums">
                    {formatBytes(usage)} of {formatBytes(quota)} ·{' '}
                    {formatPercent(fraction)}
                  </span>
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-chart-2 h-full rounded-full"
                    style={{
                      width: `${Math.max(fraction * 100, fraction > 0 ? 1.5 : 0)}%`,
                    }}
                  />
                </div>
                <p className="text-muted-foreground/70 text-[10px] leading-relaxed">
                  Browser estimate across all storage types for this origin;
                  updates lazily, so it may lag after clearing.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm">In-memory storage</p>
              <p className="text-muted-foreground/70 text-[11px] leading-relaxed">
                This collection is held in memory only — nothing is written to
                IndexedDB, so there is no on-disk size to measure, and all data
                is lost on reload.
              </p>
            </div>
          )}
        </section>

        {persistent && (
          <section className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  persisted
                    ? 'bg-chart-2'
                    : 'border-muted-foreground/50 border bg-transparent',
                )}
              />
              <div className="flex flex-col">
                <span className="text-sm">
                  {persisted == null
                    ? 'Persistence status unknown'
                    : persisted
                      ? 'Protected from eviction'
                      : 'Not protected — data may be evicted'}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {persisted
                    ? 'The browser will not clear this storage under pressure'
                    : 'Common in incognito windows; ask the browser to persist'}
                </span>
              </div>
            </div>
            {!persisted && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePersist}
                disabled={persist.isPending}
                className="h-8 shrink-0 gap-1.5 text-xs"
              >
                <ShieldCheckIcon className="size-3.5" />
                Protect from eviction
              </Button>
            )}
          </section>
        )}

        {persistent && (
          <div className="flex items-center justify-end gap-2 px-1">
            {confirmingClear ? (
              <>
                <span className="text-muted-foreground text-xs">
                  Clear all persisted data?
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingClear(false)}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleClear}
                  disabled={clear.isPending}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Trash2Icon className="size-3.5" />
                  Confirm clear
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingClear(true)}
                className="text-muted-foreground hover:text-destructive h-8 gap-1.5 text-xs"
              >
                <Trash2Icon className="size-3.5" />
                Clear database
              </Button>
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
