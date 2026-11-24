import { useMemo } from 'react';
import {
  AlertTriangleIcon,
  BookOpenText,
  ChartNoAxesGantt,
  XIcon,
} from 'lucide-react';
import type { ViewPropsOf } from '@kestack/kabuki/react/types';
import { Button } from '@kestack/web-platform/ui/components/button';
import { cn } from '@kestack/web-platform/ui/components/utils';
import {
  groupByTrace,
  type TraceGroup,
  type TraceLayout,
} from '../../../logic/shared/index.js';
import type { TraceShape } from '../logic/shared/index.js';
import { TraceDock, type TraceDockSettings } from './trace-dock.js';

/*
 * The opened Trace drawn: a header with its name, size and the view to
 * draw it in, then the Trace itself, with the Span inspector beside it.
 */

export function Body({
  root,
  model,
  props,
  send,
}: ViewPropsOf<typeof TraceShape>) {
  const trace = useMemo(
    () => groupByTrace(model.spans)[0] ?? null,
    [model.spans],
  );
  const { layout } = props;
  const close = () => send({ _tag: 'Closed' });
  const layOut = (next: Partial<TraceLayout>) =>
    send({ _tag: 'LaidOut', layout: { ...layout, ...next } });

  if (trace === null)
    return (
      <div {...root} className="flex h-full flex-col overflow-hidden">
        <Missing ready={model.ready} onClose={close} />
      </div>
    );

  const settings: TraceDockSettings = {
    open: true,
    height: 300,
    sidebarWidth: layout.sidebarWidth,
    nameColWidth: layout.nameColWidth,
    sidebarOpen: layout.sidebarOpen,
    selectedSpanId: model.selectedSpanId,
  };
  const settle = (next: TraceDockSettings) => {
    if (next.selectedSpanId !== model.selectedSpanId)
      send({ _tag: 'Inspected', spanId: next.selectedSpanId });
    if (
      next.sidebarWidth !== layout.sidebarWidth ||
      next.nameColWidth !== layout.nameColWidth ||
      next.sidebarOpen !== layout.sidebarOpen
    )
      layOut({
        sidebarWidth: next.sidebarWidth,
        nameColWidth: next.nameColWidth,
        sidebarOpen: next.sidebarOpen,
      });
  };
  const pick = (view: TraceLayout['view']) => layOut({ view });

  return (
    <div {...root} className="flex h-full flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 sm:h-11 sm:gap-3 sm:px-4">
        <StatusDot status={trace.status} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
          {trace.name}
        </span>
        {trace.missingRoot && (
          <span
            role="status"
            className="flex shrink-0 items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400"
          >
            <AlertTriangleIcon className="size-3.5" /> No root span found
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {trace.spanCount} span{trace.spanCount === 1 ? '' : 's'} ·{' '}
          {formatDuration(trace.duration)}
        </span>
        <div className="flex rounded-md border border-border/70 bg-muted/30 p-0.5">
          <IconToggle
            active={layout.view === 'waterfall'}
            label="Waterfall"
            onClick={() => pick('waterfall')}
          >
            <ChartNoAxesGantt className="size-3.5" />
          </IconToggle>
          <IconToggle
            active={layout.view === 'narrative'}
            label="Narrative"
            onClick={() => pick('narrative')}
          >
            <BookOpenText className="size-3.5" />
          </IconToggle>
        </div>
        <CloseButton onClose={close} />
      </div>
      <div className="min-h-0 flex-1">
        <TraceDock
          key={trace.traceId}
          trace={trace}
          settings={settings}
          onSettingsChange={settle}
          onClose={close}
          showHeader={false}
          responsiveSidebar
          view={layout.view}
        />
      </div>
    </div>
  );
}

/** The Trace is not in what the DevTools Server keeps, or not yet. */
function Missing({ ready, onClose }: { ready: boolean; onClose: () => void }) {
  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-end border-b border-border px-2 sm:h-11 sm:px-4">
        <CloseButton onClose={onClose} />
      </div>
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          {ready ? 'This Trace has no Spans any more.' : 'Loading the Trace…'}
        </p>
      </div>
    </>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-10 sm:size-8"
      aria-label="Back to traces"
      onClick={onClose}
    >
      <XIcon className="size-4" />
      <span className="sr-only">Close Trace</span>
    </Button>
  );
}

function IconToggle({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex h-7 items-center rounded px-2 text-muted-foreground hover:text-foreground',
        active && 'bg-background text-foreground shadow-sm',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: TraceGroup['status'] }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'error' && 'bg-destructive',
        status === 'running' && 'animate-pulse bg-amber-500',
        status === 'success' && 'bg-emerald-600',
        status === 'unset' && 'bg-muted-foreground',
      )}
    />
  );
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return 'running';
  if (milliseconds < 1) return '<1ms';
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  return `${(milliseconds / 1_000).toFixed(2)}s`;
}
