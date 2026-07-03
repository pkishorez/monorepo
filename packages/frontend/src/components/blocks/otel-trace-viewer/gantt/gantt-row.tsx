import { ChevronRightIcon } from 'lucide-react';

import { cn } from '#lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '#components/ui/context-menu';

import { STATUS_BG, STATUS_RING, StatusDot } from '../status';
import { formatSpanName, isLog } from '../trace-model';
import {
  BAR_COL_INSET,
  BAR_HEIGHT_PX,
  BAR_MIN_WIDTH_PX,
  INDENT_PX,
  NAME_COL_WIDTH,
  ROW_HEIGHT_PX,
  type GanttRow as GanttRowData,
} from './layout';

interface GanttRowProps {
  row: GanttRowData;
  selected: boolean;
  minWidthPct?: number;
  onClick: () => void;
  onToggleCollapse: () => void;
  onExpandFirstLevel: () => void;
  onExpandSubtree: () => void;
  nameColWidth?: number;
}

export function GanttRow({
  row,
  selected,
  minWidthPct = 0,
  onClick,
  onToggleCollapse,
  onExpandFirstLevel,
  onExpandSubtree,
  nameColWidth = NAME_COL_WIDTH,
}: GanttRowProps) {
  const {
    span,
    depth,
    startPct,
    widthPct,
    hasChildren,
    collapsed,
    hiddenCount,
  } = row;
  const logCount = span.events.filter(isLog).length;
  // The bar is only as wide as its pixel minimum — dim it so a clamped sliver
  // reads as "too short to scale" rather than a real duration.
  const atMinWidth = minWidthPct > 0 && widthPct < minWidthPct;
  // Keep that minimum-width bar fully inside the column instead of letting it
  // overflow the right edge (which clips it back down to a sliver).
  const effWidthPct = Math.max(widthPct, minWidthPct);
  const leftPct =
    minWidthPct > 0
      ? Math.min(startPct, Math.max(0, 1 - effWidthPct))
      : startPct;

  const rowButton = (
    <button
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'group relative flex w-full items-stretch border-b border-border/20 text-left',
        'transition-colors hover:bg-muted/20',
        selected && 'bg-primary/10 hover:bg-primary/10',
      )}
      style={{ minHeight: `${ROW_HEIGHT_PX}px` }}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-0.5 bg-primary"
        />
      )}
      {/* Name column — indented by depth, comfortable left/right padding */}
      <div
        className="flex shrink-0 items-center gap-1.5 overflow-hidden border-r border-border/30"
        style={{
          width: `${nameColWidth}px`,
          paddingLeft: `${depth * INDENT_PX + 12}px`,
          paddingRight: '12px',
        }}
      >
        {/* Fixed-width disclosure slot — always reserved so toggling never
            shifts the row. A clickable toggle for parents, empty for leaves. */}
        {hasChildren ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label={collapsed ? 'Expand span' : 'Collapse span'}
            title={collapsed ? 'Expand' : 'Collapse'}
            onClick={(e) => {
              // Toggle without selecting the span / opening the detail panel.
              e.stopPropagation();
              onToggleCollapse();
            }}
            style={{ width: `${ROW_HEIGHT_PX}px` }}
            className="flex shrink-0 cursor-pointer items-center justify-center self-stretch text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRightIcon
              className={cn(
                'size-3.5 transition-transform',
                collapsed ? 'text-foreground' : 'rotate-90',
              )}
            />
          </span>
        ) : (
          <span
            aria-hidden
            style={{ width: `${ROW_HEIGHT_PX}px` }}
            className="shrink-0 self-stretch"
          />
        )}
        <StatusDot status={span.status} />
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-mono text-xs',
            selected && 'font-semibold text-foreground',
          )}
          title={formatSpanName(span.name, span.attributes)}
        >
          {formatSpanName(span.name, span.attributes)}
        </span>
        {collapsed && hiddenCount > 0 && (
          <span className="ml-1 shrink-0 rounded-sm bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
            +{hiddenCount} more span{hiddenCount === 1 ? '' : 's'}
          </span>
        )}
        {logCount > 0 && (
          <span className="ml-1 shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
            {logCount} {logCount === 1 ? 'log' : 'logs'}
          </span>
        )}
      </div>

      {/* Bar column outer — flex-1, clips overflow */}
      <div className="flex-1 overflow-hidden">
        {/*
         * Inner positioned container with the same horizontal inset as the header ticks.
         * Using margin (not padding) so absolute children use this element's
         * narrower width as their percentage reference — aligning with the tick marks.
         */}
        <div
          style={{
            position: 'relative',
            height: '100%',
            marginLeft: BAR_COL_INSET,
            marginRight: BAR_COL_INSET,
          }}
        >
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 rounded-sm',
              STATUS_BG[span.status],
              span.status === 'running' && 'animate-pulse',
              selected &&
                cn(
                  'ring-2 ring-offset-1 ring-offset-background',
                  STATUS_RING[span.status],
                ),
            )}
            style={{
              left: `${(leftPct * 100).toFixed(4)}%`,
              width: `${(widthPct * 100).toFixed(4)}%`,
              minWidth: `${BAR_MIN_WIDTH_PX}px`,
              height: `${BAR_HEIGHT_PX}px`,
              opacity: atMinWidth ? 0.6 : undefined,
            }}
          />
        </div>
      </div>
    </button>
  );

  // Leaf spans have nothing to collapse — skip the menu entirely.
  if (!hasChildren) return rowButton;

  return (
    <ContextMenu>
      <ContextMenuTrigger render={rowButton} />
      <ContextMenuContent>
        <ContextMenuItem onClick={onExpandFirstLevel}>
          Expand first level
        </ContextMenuItem>
        <ContextMenuItem onClick={onExpandSubtree}>
          Expand recursively
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleCollapse}>
          {collapsed ? 'Expand' : 'Collapse'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
