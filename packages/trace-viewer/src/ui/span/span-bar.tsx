import React, { useContext } from 'react';
import { motion, MotionValue } from '@monorepo/frontend/motion';
import { cn } from '@monorepo/frontend/utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@monorepo/frontend/components/ui/tooltip';
import { Badge } from '@monorepo/frontend/components/ui/badge';
import { Triangle } from '@monorepo/frontend/lucide';
import type { LayoutSpan, AllLayoutResults } from '../../core/layout.js';
import { millisToPxs } from '../../core/layout.js';
import { transition, SPAN_LAYOUT, TIMELINE_LAYOUT } from '../constants.js';
import { timelineContext } from '../timeline/context.js';

// ============================================================================
// Types
// ============================================================================

export type SpanStatus = 'in-progress' | 'success' | 'error' | 'interrupted';
export type HoverStatus =
  | 'active'
  | 'parent'
  | 'child'
  | 'disable'
  | 'no-hover';

type LayoutEvent = AllLayoutResults['spans'][number]['events'][number];

export interface SpanBarProps {
  spanId: string;
  span: LayoutSpan;
  name: string;
  x: number;
  y: number;
  width: MotionValue<number>;
  opacity: MotionValue<number>;
  depth: number;
  duration: number | null;
  status: SpanStatus;
  events?: LayoutEvent[];

  isSelected: boolean;
  hoverStatus: HoverStatus;
  enableMeta: boolean;
  enableTooltip: boolean;
  onClick: (ev: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children?: React.ReactNode;
}

// ============================================================================
// Helper Functions
// ============================================================================

export const getSpanUIKey = (id: string) => `shadow-ui-span-${id}`;

function useSpanUIKey(spanId: string): string {
  const { getUniqueSpanId } = useContext(timelineContext);
  return getSpanUIKey(getUniqueSpanId(spanId));
}

function getHoverClassName(hoverStatus: HoverStatus, depth: number): string {
  const isRoot = depth === 0;
  const rootOutline = 'outline-dashed outline-1 outline-foreground/60';

  switch (hoverStatus) {
    case 'active':
      return isRoot ? `${rootOutline}` : 'outline-foreground border-foreground';
    case 'parent':
      return isRoot
        ? `${rootOutline}`
        : 'outline-foreground/50 border-foreground/50';
    case 'child':
      return isRoot
        ? `${rootOutline}`
        : 'outline-foreground/30 border-foreground/30';
    case 'disable':
      return isRoot ? rootOutline : '';
    case 'no-hover':
      return isRoot ? rootOutline : '';
    default:
      return '';
  }
}

function getStatusClassName(status: SpanStatus): string {
  const statusColors = {
    'in-progress': 'bg-foreground',
    success: 'bg-green-700 dark:bg-green-400',
    error: 'bg-red-700 dark:bg-red-400',
    interrupted: 'bg-yellow-600 dark:bg-yellow-400',
  };

  return statusColors[status];
}

function formatDuration(ms: number | null): string | null {
  if (ms === null) return null;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getStatusDisplayInfo(status: SpanStatus): {
  label: string;
  color: string;
} {
  const statusInfo = {
    'in-progress': {
      label: 'Running',
      color: 'text-blue-600 dark:text-blue-400',
    },
    success: {
      label: 'Success',
      color: 'text-green-600 dark:text-green-800',
    },
    error: {
      label: 'Error',
      color: 'text-red-600 dark:text-red-400',
    },
    interrupted: {
      label: 'Interrupted',
      color: 'text-yellow-600 dark:text-yellow-400',
    },
  };

  return statusInfo[status];
}

// ============================================================================
// SpanBar Component
// ============================================================================

export const SpanBar = React.memo(function SpanBar({
  spanId,
  span,
  name,
  x,
  y,
  width,
  opacity,
  depth,
  duration,
  status,
  events = [],

  isSelected,
  hoverStatus,
  enableMeta,
  enableTooltip,
  onClick,
  onMouseEnter,
  onMouseLeave,
  children,
}: SpanBarProps) {
  const uniqueUIKey = useSpanUIKey(spanId);
  const spanHeight = SPAN_LAYOUT.BASE_HEIGHT_PX;

  const showInlineMeta = enableMeta && depth > 0;

  const durationStr = formatDuration(duration);
  const statusInfo = getStatusDisplayInfo(status);
  const eventCount = events.length;

  const contentElement = (
    <div
      style={{ gridRow: 1, gridColumn: 1 }}
      className="flex items-center justify-between gap-1 overflow-hidden h-full"
    >
      <span
        className={cn(
          'overflow-hidden text-ellipsis text-xs px-2 text-nowrap shrink min-w-0',
          'transition-colors duration-200 font-medium',
          'text-background select-none',
        )}
      >
        {name}
      </span>
      {showInlineMeta && (
        <motion.span
          style={{}}
          className={cn(
            'shrink-0 text-xs px-1 mr-1 rounded font-medium',
            'transition-colors duration-200',
            'text-background/90 bg-background/25 dark:bg-background/20',
          )}
        >
          d:{depth}
        </motion.span>
      )}
    </div>
  );

  return (
    <motion.div
      key={spanId}
      id={uniqueUIKey}
      onClick={(ev) => onClick(ev)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      initial={{ y }}
      variants={{
        highlight: {
          boxShadow: !span.orig.end
            ? [
                '0 0 5px currentColor',
                '0 0 10px currentColor',
                '0 0 15px currentColor',
              ]
            : 'none',
          y,
        },
        end: {
          scaleY: [1, 1.2, 1],
          boxShadow: ['0 0 5px currentColor', '0 0 10px currentColor', 'none'],
          keyTimes: [0, 0.5, 1],
          transition: {
            duration: 0.4,
          },
          y,
        },
      }}
      animate={span.orig.end ? 'end' : 'highlight'}
      className={cn(
        'grid items-center group/span cursor-pointer',
        'rounded-lg border border-transparent',
        'outline-2 outline-transparent hover:outline-foreground/50 outline-offset-2',
        'transition-[opacity,background-color,outline,border] duration-200 ease-linear',
        isSelected &&
          'outline-foreground hover:outline-foreground relative z-10',
        getHoverClassName(hoverStatus, depth),
        getStatusClassName(status),
      )}
      style={{
        x,
        opacity,
        gridRow: 1,
        gridColumn: 1,
        width,
        height: spanHeight,
        marginTop: (TIMELINE_LAYOUT.ROW_HEIGHT_PX - spanHeight) / 2,
      }}
      transition={transition}
    >
      {enableTooltip ? (
        <Tooltip disableHoverablePopup>
          <TooltipTrigger render={contentElement} />
          <TooltipContent side="bottom" sideOffset={12} className="p-3">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-background select-none">
                {name}
              </div>

              <div className="text-xs font-mono">
                <span className="text-background/70">ID:</span>{' '}
                <span className="text-background">{spanId}</span>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <Badge
                  variant={status === 'error' ? 'destructive' : 'secondary'}
                  className={cn({
                    'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:text-green-950':
                      status === 'success',
                    'bg-yellow-600 text-white hover:bg-yellow-700 dark:bg-yellow-500 dark:text-yellow-950':
                      status === 'interrupted',
                    'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-blue-950':
                      status === 'in-progress',
                  })}
                >
                  {statusInfo.label}
                </Badge>
                <span>
                  <span className="text-background/70">Depth:</span>{' '}
                  <span className="text-background">{depth}</span>
                </span>
                {durationStr && (
                  <span className="text-background">{durationStr}</span>
                )}
                {eventCount > 0 && (
                  <span className="text-background/70">
                    {eventCount} events
                  </span>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        contentElement
      )}
      {children}
    </motion.div>
  );
});

// ============================================================================
// SpanEvents Component
// ============================================================================

export interface SpanEventsProps {
  events: LayoutEvent[];
  secondInPxs: number;
}

export const SpanEvents = React.memo(function SpanEvents({
  events,
  secondInPxs,
}: SpanEventsProps) {
  return (
    <>
      {events.map(({ orig: { attributes }, xRel }, index) => {
        const eventX = millisToPxs(xRel, secondInPxs);
        const isError = attributes['effect.logLevel'] === 'ERROR';

        return (
          <span
            key={index}
            className="w-min self-end"
            style={{
              gridRow: 1,
              gridColumn: 1,
              transform: `translate(${eventX}px, calc(100% + 2px))`,
            }}
          >
            <Triangle
              className={cn(
                'w-2 h-2 opacity-40 group-hover/span:opacity-100',
                'transition-all ease-out duration-200 -translate-x-1/2',
                'text-foreground fill-current',
                { 'text-red-800 dark:text-red-400': isError },
              )}
            />
          </span>
        );
      })}
    </>
  );
});
