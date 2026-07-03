import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangleIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SearchIcon,
} from '@monorepo/frontend/lucide';
import { AnimatePresence, motion } from '@monorepo/frontend/motion';
import { cn } from '@monorepo/frontend/lib/utils';
import { scrollbarStyles } from '@monorepo/frontend/lib/scrollStyles';
import {
  formatRelativeTime,
  formatServiceName,
  NO_ROOT_SERVICE,
  type ServiceInsight,
} from './filters';
import { Header as ClearTelemetry } from './header';

interface ServiceRailProps {
  insights: ServiceInsight[];
  selectedService: string | null;
  onSelectService: (name: string) => void;
  collapsed: boolean;
  onToggleCollapsed: (next: boolean) => void;
  width: number;
  onWidthChange: (next: number) => void;
  onClear: () => void;
}

const MIN_RAIL_WIDTH = 200;
const MAX_RAIL_WIDTH = 480;

/**
 * Persistent left navigation of services. Single-select toggle: clicking the
 * active service deselects it (back to the all-services overview). Rows sort
 * errors-first and animate their reorder via layout transitions.
 */
export function ServiceRail({
  insights,
  selectedService,
  onSelectService,
  collapsed,
  onToggleCollapsed,
  width,
  onWidthChange,
  onClear,
}: ServiceRailProps) {
  const [query, setQuery] = useState('');

  const widthRef = useRef(width);
  widthRef.current = width;

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;

      function onMouseMove(ev: MouseEvent) {
        const next = Math.min(
          MAX_RAIL_WIDTH,
          Math.max(MIN_RAIL_WIDTH, startW + ev.clientX - startX),
        );
        onWidthChange(next);
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onWidthChange],
  );

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return insights
      .filter(
        (s) => q === '' || formatServiceName(s.name).toLowerCase().includes(q),
      )
      .slice()
      .sort((a, b) => {
        if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
        if (b.traceCount !== a.traceCount) return b.traceCount - a.traceCount;
        return a.name.localeCompare(b.name);
      });
  }, [insights, query]);

  if (collapsed) {
    return (
      <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-r border-border/40 bg-background py-3">
        <button
          type="button"
          onClick={() => onToggleCollapsed(false)}
          aria-label="Expand services"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <PanelLeftOpenIcon className="size-4" />
        </button>
        <span className="mt-1 text-[10px] tabular-nums text-muted-foreground/70">
          {insights.length}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Collapse services"
        onClick={() => onToggleCollapsed(true)}
        className="absolute inset-0 z-20 bg-black/20 md:hidden"
      />
      <div
        style={{ width }}
        className="relative z-30 flex shrink-0 flex-col border-r border-border/40 bg-background max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:shadow-xl"
      >
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/20 max-md:hidden"
        />
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">Services</span>
          <div className="flex items-center gap-1">
            <span className="text-xs tabular-nums text-muted-foreground">
              {insights.length}
            </span>
            <button
              type="button"
              onClick={() => onToggleCollapsed(true)}
              aria-label="Collapse services"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <PanelLeftCloseIcon className="size-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-3 pb-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services…"
              className="h-7 w-full rounded-md border border-border bg-transparent pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground/60 focus:border-foreground/30"
            />
          </div>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-auto px-2 py-1',
            scrollbarStyles,
          )}
        >
          {sorted.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              {insights.length === 0 ? 'Waiting for telemetry…' : 'No matches'}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {sorted.map((s) => (
                <motion.button
                  key={s.name}
                  type="button"
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => onSelectService(s.name)}
                  aria-pressed={selectedService === s.name}
                  className={cn(
                    'mb-0.5 flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors',
                    selectedService === s.name
                      ? 'bg-muted text-foreground'
                      : 'hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={cn(
                        'min-w-0 truncate font-mono text-xs font-medium',
                        s.name === NO_ROOT_SERVICE &&
                          'italic text-muted-foreground',
                      )}
                    >
                      {formatServiceName(s.name)}
                    </span>
                    {s.errorCount > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium tabular-nums text-destructive">
                        <AlertTriangleIcon className="size-2.5" />
                        {s.errorCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[10px] tabular-nums text-muted-foreground/70">
                    <span>
                      {s.traceCount} trace{s.traceCount !== 1 ? 's' : ''}
                    </span>
                    <span>{formatRelativeTime(s.lastSeen)}</span>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end border-t border-border/40 px-2 py-1.5">
          <ClearTelemetry onClear={onClear} />
        </div>
      </div>
    </>
  );
}
