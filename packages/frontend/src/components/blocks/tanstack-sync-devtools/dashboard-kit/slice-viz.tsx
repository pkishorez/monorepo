import { cn } from '#lib/utils';
import { ArrowLeftIcon, ArrowLeftRightIcon, ArrowRightIcon } from '#lib/lucide';
import type { LucideIcon } from '#lib/lucide';
import type { InspectorStrategyState } from '../view-model';
import { cursorU } from './cursor';

type StrategyKind = InspectorStrategyState['strategy'];

/** Per-strategy legend: a short name and a distinct directional icon. */
export const STRATEGY_META: Record<
  StrategyKind,
  { label: string; Icon: LucideIcon }
> = {
  oldToNew: { label: 'old → new', Icon: ArrowRightIcon },
  newToOld: { label: 'old ← new', Icon: ArrowLeftIcon },
  bidirectional: { label: 'old ↔ new', Icon: ArrowLeftRightIcon },
};

export type SliceVizProps = {
  strategyState: InspectorStrategyState;
  /** Authoritative item total; overrides the count derived from slices. */
  totalItems?: number;
  /** Whether a live subscription is currently reading this partition. */
  active?: boolean;
  /** Render only the bar(s); skip the strategy label + count caption. */
  hideCaption?: boolean;
  className?: string;
};

function Caption({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="text-muted-foreground flex items-center justify-between text-[10px]">
      <span className="font-medium tracking-wide uppercase">{label}</span>
      <span className="tabular-nums">{detail}</span>
    </div>
  );
}

export function SliceViz({
  strategyState,
  totalItems,
  active = false,
  hideCaption = false,
  className,
}: SliceVizProps) {
  if (strategyState.strategy === 'oldToNew') {
    const count = totalItems ?? 0;
    const filled = count > 0;
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <div className="ring-border/50 flex h-4 items-stretch overflow-hidden rounded-md ring-1">
          <div
            className={cn(
              'flex-1 transition-opacity duration-300 ease-out',
              filled ? 'bg-foreground' : 'bg-muted',
            )}
            style={{ opacity: filled ? (active ? 0.9 : 0.55) : 1 }}
          />
        </div>
        {!hideCaption && (
          <Caption
            label={STRATEGY_META.oldToNew.label}
            detail={`${count} item${count !== 1 ? 's' : ''}`}
          />
        )}
      </div>
    );
  }

  const { slices } = strategyState;
  const reachedOldest =
    strategyState.strategy === 'newToOld' && strategyState.reachedOldest;
  const total =
    totalItems ?? slices.reduce((sum, x) => sum + Math.max(x.itemCount, 0), 0);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex h-5 min-w-0 items-stretch gap-1 overflow-hidden">
        {slices.length === 0 ? (
          <div className="bg-muted flex-1 rounded-md" />
        ) : (
          slices.map((slice, index) => {
            const lo = cursorU(slice.low);
            const hi = cursorU(slice.high);
            return (
              <div
                key={index}
                title={`${slice.itemCount} items · ${lo ?? '?'}–${hi ?? '?'}`}
                className={cn(
                  'bg-foreground flex min-w-[2px] items-center justify-center overflow-hidden rounded-sm px-1',
                  'transition-[flex-grow,opacity] duration-300 ease-out',
                )}
                style={{
                  flexGrow: Math.max(slice.itemCount, 0.0001),
                  flexShrink: 1,
                  flexBasis: 0,
                  opacity: active ? 0.9 : 0.6,
                }}
              >
                <span className="text-background text-[9px] font-semibold tabular-nums">
                  {slice.itemCount}
                </span>
              </div>
            );
          })
        )}
      </div>
      {!hideCaption && (
        <Caption
          label={
            reachedOldest
              ? 'fully synced'
              : STRATEGY_META[strategyState.strategy].label
          }
          detail={`${total} item${total !== 1 ? 's' : ''} · ${slices.length} slice${
            slices.length !== 1 ? 's' : ''
          }`}
        />
      )}
    </div>
  );
}
