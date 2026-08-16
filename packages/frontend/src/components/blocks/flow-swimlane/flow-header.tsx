import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeOffIcon,
  RotateCcwIcon,
} from 'lucide-react';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';
import type { FlowLayout } from './layout';

const frameMargin = 8;
const gridInset = 8 + frameMargin + 1; // Header padding + frame margin + border.

const ParticipantHighlight = ({ active }: { readonly active: boolean }) => (
  <div
    data-flow-participant-highlight
    data-active={active || undefined}
    className={cn(
      'pointer-events-none absolute inset-0 border border-foreground/30 bg-foreground/[0.07] shadow-[inset_3px_0_0_var(--color-foreground)] transition-opacity duration-200',
      active ? 'opacity-100' : 'opacity-0',
    )}
  />
);

export function FlowHeader({
  layout,
  activeParticipantName,
  allSummariesCollapsed,
  hasSummaries,
  onHideParticipant,
  onHideSubtree,
  onRestore,
  onToggleAllSummaries,
  onToggleCollapse,
}: {
  readonly layout: FlowLayout;
  readonly activeParticipantName: string | null;
  readonly allSummariesCollapsed: boolean;
  readonly hasSummaries: boolean;
  readonly onHideParticipant: (participantName: string) => void;
  readonly onHideSubtree: (path: string) => void;
  readonly onRestore: (
    path: string,
    marker: 'collapsed' | 'hidden' | 'participant',
  ) => void;
  readonly onToggleAllSummaries: () => void;
  readonly onToggleCollapse: (path: string) => void;
}) {
  const { columns, headerCells } = layout.hierarchy;
  const sideGutter = Math.max(0, layout.sidePadding - gridInset);

  return (
    <div
      data-flow-header
      className="sticky top-0 z-20 isolate border-b border-border bg-background p-2 shadow-[0_10px_20px_-20px_var(--color-foreground)]"
      style={{ width: layout.width }}
    >
      <div
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        style={{ marginInline: frameMargin }}
      >
        <div className="relative z-20 flex min-h-9 w-fit items-center px-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!hasSummaries}
            onClick={onToggleAllSummaries}
          >
            {allSummariesCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
        </div>
        <div
          className="grid border-t border-border"
          style={{
            gridTemplateColumns: `${sideGutter}px ${columns
              .map(({ width }) => `${width}px`)
              .join(' ')} ${sideGutter}px`,
            gridTemplateRows: `repeat(${layout.hierarchy.maxDepth}, minmax(48px, auto))`,
          }}
        >
          {headerCells
            .filter((cell) => cell.kind === 'node')
            .map((cell) => {
              const activeSection =
                activeParticipantName !== null &&
                (activeParticipantName === cell.path ||
                  activeParticipantName.startsWith(`${cell.path}/`));
              return (
                <div
                  key={`section:${cell.key}:${cell.row}`}
                  data-active-participant-section={activeSection || undefined}
                  data-participant-section={cell.path}
                  aria-hidden
                  className={cn(
                    'pointer-events-none z-0 bg-foreground/[0.035] transition-opacity duration-200',
                    activeSection ? 'opacity-100' : 'opacity-0',
                  )}
                  style={{
                    gridColumn: `${cell.startColumn + 2} / ${cell.endColumn + 3}`,
                    gridRow: `${cell.row + 1} / ${layout.hierarchy.maxDepth + 1}`,
                  }}
                />
              );
            })}
          {headerCells.map((cell) => {
            const gridColumnStart = cell.startColumn + 2;
            const gridColumnEnd = cell.endColumn + 3;
            const hiddenLabel =
              cell.participantCount === 1
                ? '1 hidden'
                : `${cell.participantCount} participants hidden`;

            if (cell.kind === 'marker') {
              const participantHidden = cell.marker === 'participant';
              return (
                <button
                  key={`${cell.key}:${cell.row}`}
                  type="button"
                  className="z-10 flex min-w-0 items-center justify-center gap-1.5 border-r border-b border-dashed border-border bg-muted/25 px-3 py-2 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  style={{
                    gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
                    gridRow: cell.row + 1,
                  }}
                  aria-label={
                    participantHidden
                      ? `Restore ${cell.path} own activity`
                      : `Restore ${cell.path}`
                  }
                  title={
                    participantHidden
                      ? `Restore ${cell.path} own activity`
                      : `Restore ${cell.path}`
                  }
                  onClick={() => onRestore(cell.path, cell.marker!)}
                >
                  <RotateCcwIcon className="size-3.5 shrink-0" />
                  <span className="break-words whitespace-normal">
                    {cell.marker === 'participant'
                      ? 'own activity hidden'
                      : cell.marker === 'hidden'
                        ? hiddenLabel
                        : `${cell.label} · ${cell.participantCount} collapsed`}
                  </span>
                </button>
              );
            }

            if (cell.kind === 'self') {
              const active = activeParticipantName === cell.path;
              return (
                <div
                  key={`${cell.key}:${cell.row}`}
                  className={cn(
                    'relative z-10 flex min-w-0 items-center justify-between gap-2 border-r border-b border-border/70 px-3 py-2 transition-colors duration-200',
                    active ? 'bg-foreground/[0.04]' : 'bg-transparent',
                  )}
                  data-active-participant={active || undefined}
                  data-active-participant-path={active || undefined}
                  data-participant-path={cell.path}
                  style={{
                    gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
                    gridRow: cell.row + 1,
                  }}
                  title={`${cell.path} — own lane`}
                >
                  <ParticipantHighlight active={active} />
                  <span
                    className={cn(
                      'relative inline-flex min-w-0 items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors duration-300',
                      active ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <span className="size-1 rounded-full bg-muted-foreground/60" />
                    own activity
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Hide ${cell.path} own activity`}
                    title="Hide this participant lane"
                    className="relative shrink-0 text-muted-foreground"
                    onClick={() => onHideParticipant(cell.path)}
                  >
                    <EyeOffIcon />
                  </Button>
                </div>
              );
            }

            const group = cell.descendantCount > 0;
            const onActivePath =
              activeParticipantName !== null &&
              (activeParticipantName === cell.path ||
                activeParticipantName.startsWith(`${cell.path}/`));
            const hasOwnActivityCell = headerCells.some(
              (candidate) =>
                candidate.kind === 'self' && candidate.path === cell.path,
            );
            const active =
              activeParticipantName === cell.path && !hasOwnActivityCell;
            return (
              <div
                key={`${cell.key}:${cell.row}`}
                className={cn(
                  'relative z-10 flex min-w-0 items-center gap-2 border-r border-b border-border/70 px-3 py-2 transition-colors duration-200',
                  group ? 'justify-between' : 'justify-center',
                  onActivePath ? 'bg-foreground/[0.025]' : 'bg-transparent',
                )}
                data-active-participant={active || undefined}
                data-active-participant-path={onActivePath || undefined}
                data-participant-path={cell.path}
                style={{
                  gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
                  gridRow: cell.row + 1,
                }}
              >
                <ParticipantHighlight active={active} />
                <div className="relative flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'min-w-0 break-words leading-snug font-semibold whitespace-normal transition-colors duration-300',
                      group ? 'text-[11px]' : 'text-center text-xs',
                      active ? 'text-foreground' : 'text-foreground/90',
                    )}
                    title={cell.path}
                  >
                    {cell.label}
                    {cell.collapsed && (
                      <span className="ml-1 text-[9px] font-medium text-muted-foreground">
                        · {cell.descendantCount} collapsed
                      </span>
                    )}
                  </span>
                </div>
                <span className="relative flex shrink-0 items-center gap-0.5">
                  {cell.descendantCount > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${cell.collapsed ? 'Expand' : 'Collapse'} descendants of ${cell.path}`}
                      title={`${cell.collapsed ? 'Expand' : 'Collapse'} descendants`}
                      onClick={() => onToggleCollapse(cell.path)}
                    >
                      {cell.collapsed ? (
                        <ChevronRightIcon />
                      ) : (
                        <ChevronDownIcon />
                      )}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={
                      group
                        ? `Hide ${cell.path} and its descendants`
                        : `Hide ${cell.path}`
                    }
                    title={
                      group ? 'Hide participant subtree' : 'Hide participant'
                    }
                    className="text-muted-foreground"
                    onClick={() =>
                      group
                        ? onHideSubtree(cell.path)
                        : onHideParticipant(cell.path)
                    }
                  >
                    <EyeOffIcon />
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
