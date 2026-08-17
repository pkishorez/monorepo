import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileQuestion,
} from '#lib/lucide';
import { cn } from '#lib/utils';

import type {
  LayerCoverageViolation,
  LayerViolationPair,
} from '../../analysis-presentation';
import { layerCount, layerEmptyState, layerRow } from '../presentation';

interface LayerViolationsListProps {
  readonly violationPairs: readonly LayerViolationPair[];
  readonly coverageViolations?: readonly LayerCoverageViolation[];
  readonly activeViolationGroupId?: string;
  readonly onActiveViolationGroupChange?: (
    violationGroupId: string | undefined,
  ) => void;
  readonly className?: string;
}

export const coverageGroupId = 'layer-coverage';

export function LayerViolationsList({
  violationPairs,
  coverageViolations = [],
  activeViolationGroupId,
  onActiveViolationGroupChange,
  className,
}: LayerViolationsListProps) {
  const isClean =
    violationPairs.length === 0 && coverageViolations.length === 0;
  const toggle = (id: string) => {
    onActiveViolationGroupChange?.(
      activeViolationGroupId === id ? undefined : id,
    );
  };

  if (isClean) {
    return (
      <div
        className={cn(layerEmptyState, 'flex items-center gap-2', className)}
      >
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        No layer violations
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {violationPairs.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {violationPairs.map((pair) => (
            <ViolationPair
              key={pair.id}
              pair={pair}
              active={activeViolationGroupId === pair.id}
              onActivate={() => toggle(pair.id)}
            />
          ))}
        </div>
      )}
      {coverageViolations.length > 0 && (
        <CoverageViolations
          violations={coverageViolations}
          active={activeViolationGroupId === coverageGroupId}
          onActivate={() => toggle(coverageGroupId)}
        />
      )}
    </div>
  );
}

function ViolationPair({
  pair,
  active,
  onActivate,
}: {
  readonly pair: LayerViolationPair;
  readonly active: boolean;
  readonly onActivate: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        className={cn(
          layerRow,
          'h-9 gap-2 px-2.5 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40',
          active && 'bg-destructive/5',
        )}
        aria-expanded={active}
        onClick={onActivate}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium">
          <span className="truncate">{pair.fromLayerId}</span>
          <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{pair.toLayerId}</span>
        </span>
        <span className={layerCount}>{pair.violations.length}</span>
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            active && 'rotate-90',
          )}
        />
      </button>
      {active && (
        <ul className="divide-y divide-border/60 border-t border-border bg-muted/15 px-3 py-1">
          {pair.violations.map((violation) => (
            <li
              key={`${violation.fromFile}\0${violation.toFile}`}
              className="grid gap-0.5 py-1.5 text-[11px] leading-4"
            >
              <code className="break-words text-foreground">
                {violation.fromFile}
              </code>
              <span className="flex items-start gap-1 text-muted-foreground">
                <ArrowRight className="mt-0.5 size-2.5 shrink-0" />
                <code className="break-words">{violation.toFile}</code>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CoverageViolations({
  violations,
  active,
  onActivate,
}: {
  readonly violations: readonly LayerCoverageViolation[];
  readonly active: boolean;
  readonly onActivate: () => void;
}) {
  return (
    <div className="border-t border-border pt-2">
      <button
        type="button"
        className={cn(
          layerRow,
          'h-8 gap-2 px-1.5 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40',
          active && 'bg-amber-500/5',
        )}
        aria-expanded={active}
        onClick={onActivate}
      >
        <FileQuestion className="size-3.5 shrink-0 text-amber-500" />
        <span className="min-w-0 flex-1 text-xs font-medium">
          Unassigned files
        </span>
        <span className={layerCount}>{violations.length}</span>
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            active && 'rotate-90',
          )}
        />
      </button>
      {active && (
        <ul className="mt-1 space-y-1 rounded-md bg-amber-500/5 px-2.5 py-2">
          {violations.map((violation) => (
            <li key={violation.file}>
              <code className="break-words text-[11px] leading-4 text-foreground">
                {violation.file}
              </code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
