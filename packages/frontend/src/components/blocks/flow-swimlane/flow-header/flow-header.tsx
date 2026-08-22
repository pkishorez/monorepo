import {
  ChevronDownIcon,
  ChevronRightIcon,
  EyeOffIcon,
  RotateCcwIcon,
} from 'lucide-react';

import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';
import type { FlowLayout } from '../flow-presentation';

const branchRowHeight = 28;
const leafRowHeight = 44;

const activateWithKeyboard = (
  event: React.KeyboardEvent<HTMLElement>,
  activate: () => void,
) => {
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  activate();
};

const LaneAnchor = ({ active }: { readonly active: boolean }) => (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center"
  >
    <span
      className={cn(
        'size-[7px] rounded-full border-[1.5px] transition-colors duration-200',
        active
          ? 'border-primary bg-primary'
          : 'border-muted-foreground/70 bg-background',
      )}
    />
    <span
      className={cn(
        'h-1.5 w-px transition-colors duration-200',
        active ? 'bg-primary' : 'bg-muted-foreground/70',
      )}
    />
  </span>
);

const HoverActions = ({
  children,
  floating = false,
}: {
  readonly children: React.ReactNode;
  readonly floating?: boolean;
}) => (
  <span
    className={cn(
      'flex shrink-0 items-center gap-px rounded-md border border-border bg-background p-0.5 opacity-0 shadow-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
      floating ? 'absolute top-2 right-1.5' : 'sticky',
    )}
    style={floating ? undefined : { right: 6 }}
  >
    {children}
  </span>
);

const HideHint = () => (
  <span className="flex size-5 items-center justify-center text-muted-foreground">
    <EyeOffIcon aria-hidden className="size-3" />
  </span>
);

const leafCellClass =
  'group relative z-10 flex min-w-0 cursor-pointer items-end px-2.5 pb-[18px] transition-colors duration-200 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';

export function FlowHeader({
  layout,
  activeParticipantName,
  onHideParticipant,
  onHideSubtree,
  onRestore,
  onToggleCollapse,
}: {
  readonly layout: FlowLayout;
  readonly activeParticipantName: string | null;
  readonly onHideParticipant: (participantName: string) => void;
  readonly onHideSubtree: (path: string) => void;
  readonly onRestore: (
    path: string,
    marker: 'collapsed' | 'hidden' | 'participant',
  ) => void;
  readonly onToggleCollapse: (path: string) => void;
}) {
  const { columns, headerCells, maxDepth } = layout.hierarchy;
  const sideGutter = layout.sidePadding;
  const lastRow = maxDepth + 1;
  const onActivePath = (path: string) =>
    activeParticipantName !== null &&
    (activeParticipantName === path ||
      activeParticipantName.startsWith(`${path}/`));

  return (
    <div
      data-flow-header
      className="sticky top-0 z-20 isolate border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85"
      style={{ width: layout.width }}
    >
      <div
        className="grid pt-2"
        style={{
          gridTemplateColumns: `${sideGutter}px ${columns
            .map(({ width }) => `${width}px`)
            .join(' ')} ${sideGutter}px`,
          gridTemplateRows: `${
            maxDepth > 1 ? `repeat(${maxDepth - 1}, ${branchRowHeight}px) ` : ''
          }${leafRowHeight}px`,
        }}
      >
        {headerCells
          .filter((cell) => cell.kind === 'node')
          .map((cell) => {
            const activeSection = onActivePath(cell.path);
            return (
              <div
                key={`section:${cell.key}:${cell.row}`}
                data-active-participant-section={activeSection || undefined}
                data-participant-section={cell.path}
                aria-hidden
                className={cn(
                  'pointer-events-none z-0 mx-1 rounded-t-md bg-foreground/[0.03] transition-opacity duration-200',
                  activeSection ? 'opacity-100' : 'opacity-0',
                )}
                style={{
                  gridColumn: `${cell.startColumn + 2} / ${cell.endColumn + 3}`,
                  gridRow: `${cell.row + 1} / ${lastRow}`,
                }}
              />
            );
          })}
        {headerCells.map((cell) => {
          const gridColumnStart = cell.startColumn + 2;
          const gridColumnEnd = cell.endColumn + 3;
          if (cell.kind === 'marker') {
            const participantHidden = cell.marker === 'participant';
            const restoreLabel = participantHidden
              ? `Restore ${cell.path} own activity`
              : `Restore ${cell.path}`;
            return (
              <div
                key={`${cell.key}:${cell.row}`}
                className="z-10 flex min-w-0 items-end justify-center px-2 pb-3"
                style={{
                  gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
                  gridRow: `${cell.row + 1} / ${lastRow}`,
                }}
              >
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground transition-colors hover:border-solid hover:border-muted-foreground/50 hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={restoreLabel}
                  title={restoreLabel}
                  onClick={() => onRestore(cell.path, cell.marker!)}
                >
                  <RotateCcwIcon className="size-3 shrink-0" />
                  <span className="truncate whitespace-nowrap">
                    {cell.marker === 'collapsed'
                      ? `${cell.label} · ${cell.participantCount} collapsed`
                      : cell.marker === 'hidden' && cell.participantCount > 1
                        ? `${cell.participantCount} participants hidden`
                        : cell.kind === 'marker' && cell.label === 'own activity'
                          ? 'own hidden'
                          : `${cell.label} hidden`}
                  </span>
                </button>
              </div>
            );
          }

          if (cell.kind === 'self') {
            const active = activeParticipantName === cell.path;
            const ownerLabel = cell.path.split('/').at(-1) ?? cell.path;
            return (
              <div
                key={`${cell.key}:${cell.row}`}
                className={cn(
                  leafCellClass,
                  active ? 'bg-primary/[0.05]' : 'bg-transparent',
                )}
                role="button"
                tabIndex={0}
                aria-label={`Hide ${cell.path} own activity`}
                data-active-participant={active || undefined}
                data-active-participant-path={active || undefined}
                data-participant-path={cell.path}
                style={{
                  gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
                  gridRow: `${cell.row + 1} / ${lastRow}`,
                }}
                title={`${cell.path} — own activity`}
                onClick={() => onHideParticipant(cell.path)}
                onKeyDown={(event) =>
                  activateWithKeyboard(event, () =>
                    onHideParticipant(cell.path),
                  )
                }
              >
                <span className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
                  <span
                    className={cn(
                      'truncate text-xs leading-none font-medium whitespace-nowrap transition-colors duration-200',
                      active ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {ownerLabel}
                  </span>
                  <span className="shrink-0 rounded border border-border px-1 text-[9.5px] leading-[14px] text-muted-foreground">
                    own
                  </span>
                </span>
                <HoverActions floating>
                  <HideHint />
                </HoverActions>
                <LaneAnchor active={active} />
              </div>
            );
          }

          const group = cell.descendantCount > 0;
          const onPath = onActivePath(cell.path);
          const hasOwnActivityCell = headerCells.some(
            (candidate) =>
              candidate.kind === 'self' && candidate.path === cell.path,
          );
          const active =
            activeParticipantName === cell.path && !hasOwnActivityCell;
          const hide = () =>
            group ? onHideSubtree(cell.path) : onHideParticipant(cell.path);
          const hideLabel = group
            ? `Hide ${cell.path} and its descendants`
            : `Hide ${cell.path}`;

          if (!group) {
            return (
              <div
                key={`${cell.key}:${cell.row}`}
                className={cn(
                  leafCellClass,
                  active ? 'bg-primary/[0.05]' : 'bg-transparent',
                )}
                role="button"
                tabIndex={0}
                aria-label={hideLabel}
                data-active-participant={active || undefined}
                data-active-participant-path={onPath || undefined}
                data-participant-path={cell.path}
                style={{
                  gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
                  gridRow: `${cell.row + 1} / ${lastRow}`,
                }}
                title={cell.path}
                onClick={hide}
                onKeyDown={(event) => activateWithKeyboard(event, hide)}
              >
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-center text-xs leading-none font-medium whitespace-nowrap transition-colors duration-200',
                    active ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {cell.label}
                </span>
                <HoverActions floating>
                  <HideHint />
                </HoverActions>
                <LaneAnchor active={active} />
              </div>
            );
          }

          return (
            <div
              key={`${cell.key}:${cell.row}`}
              className="group relative z-10 flex min-w-0 cursor-pointer items-end justify-between gap-2 px-1 pb-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              role="button"
              tabIndex={0}
              aria-label={hideLabel}
              data-active-participant={active || undefined}
              data-active-participant-path={onPath || undefined}
              data-participant-path={cell.path}
              style={{
                gridColumn: `${gridColumnStart} / ${gridColumnEnd}`,
                gridRow: cell.row + 1,
              }}
              title={hideLabel}
              onClick={hide}
              onKeyDown={(event) => activateWithKeyboard(event, hide)}
            >
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-x-1 bottom-[3px] h-[5px] rounded-b-[3px] border-r border-b border-l transition-colors duration-200 group-hover:border-muted-foreground/70',
                  onPath ? 'border-muted-foreground/70' : 'border-border',
                )}
              />
              <span
                className="sticky flex min-w-0 items-center gap-1.5 pl-1.5"
                style={{ left: 6 }}
              >
                <span
                  className={cn(
                    'min-w-0 truncate text-[11px] leading-none font-medium whitespace-nowrap transition-colors duration-200',
                    onPath ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  title={cell.path}
                >
                  {cell.label}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-1.5 text-[9.5px] leading-[14px] font-medium text-muted-foreground tabular-nums">
                  {cell.collapsed
                    ? `${cell.descendantCount} collapsed`
                    : cell.participantCount}
                </span>
              </span>
              <HoverActions>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-5 rounded-sm"
                  aria-label={`${cell.collapsed ? 'Expand' : 'Collapse'} descendants of ${cell.path}`}
                  title={`${cell.collapsed ? 'Expand' : 'Collapse'} descendants`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleCollapse(cell.path);
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {cell.collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                </Button>
                <HideHint />
              </HoverActions>
            </div>
          );
        })}
      </div>
    </div>
  );
}
