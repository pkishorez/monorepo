import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { TraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { flowAttributes } from '@pkishorez/effect-tracer/flow';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';
import {
  attachCapturedLogs,
  TraceViewer,
} from '../otel-trace-viewer/trace-viewer';
import { FlowSection } from './flow-section';
import { useRecorderSnapshot } from './use-recorder-snapshot';

type Filter = 'traces' | 'flows';

const FILTERS: { readonly value: Filter; readonly label: string }[] = [
  { value: 'traces', label: 'Traces' },
  { value: 'flows', label: 'Flows' },
];

export interface DevToolsPanelProps {
  /** Whether the panel is shown. Render nothing while `false`. */
  readonly open: boolean;
  /** Called when the developer dismisses the panel, via its close button or Escape. */
  readonly onClose: () => void;
  /** The Recorder to show. Its `layer` should already be provided into the app's Runtime. */
  readonly recorder: TraceRecorder;
  /**
   * Which tab is active when both Traces and Flows are recorded. Ignored
   * when only one kind is present - that one shows with no tab bar at all.
   *
   * @default 'traces'
   */
  readonly defaultFilter?: Filter;
  /** Which kinds the panel offers at all. Defaults to both. */
  readonly filters?: readonly Filter[];
  readonly className?: string;
}

/**
 * Shows the Traces and Flows a `TraceRecorder` has captured, live. Fully
 * controlled: the host decides when it is open and how it gets closed, so it
 * can wire its own trigger without colliding with one this panel would own.
 *
 * With more than one Trace or Flow recorded, `TraceViewer` and `FlowSection`
 * each show their own list first - a tab per Trace, a chip per Flow - so the
 * developer picks which one to inspect. When only Traces or only Flows have
 * been recorded, that one shows directly with no tab bar to switch away from.
 */
export function DevToolsPanel({
  open,
  onClose,
  recorder,
  defaultFilter = 'traces',
  filters = ['traces', 'flows'],
  className,
}: DevToolsPanelProps) {
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const { spans, logs, flows } = useRecorderSnapshot(recorder);
  const otelSpans = useMemo(
    () => attachCapturedLogs(spans, logs),
    [spans, logs],
  );

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;

  const hasTraces =
    filters.includes('traces') &&
    spans.some((span) => span.attributes[flowAttributes.id] === undefined);
  const hasFlows = filters.includes('flows') && flows.length > 0;
  const showTabs = hasTraces && hasFlows;
  const activeFilter: Filter = !filters.includes('traces')
    ? 'flows'
    : !filters.includes('flows')
      ? 'traces'
      : !hasFlows
        ? 'traces'
        : !hasTraces
          ? 'flows'
          : filter;

  return (
    <div
      className={cn(
        'fixed inset-3 z-40 flex flex-col overflow-hidden rounded-lg border bg-background shadow-2xl',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b px-2 py-1.5">
        <div className="flex gap-1">
          {showTabs &&
            FILTERS.map(({ value, label }) => (
              <Button
                key={value}
                variant={activeFilter === value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilter(value)}
              >
                {label}
              </Button>
            ))}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close DevTools panel"
        >
          <X />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {activeFilter === 'traces' ? (
          <TraceViewer
            spans={otelSpans}
            className="min-h-0 flex-1"
            emptyMessage="No traces recorded yet."
          />
        ) : (
          <FlowSection
            flows={flows}
            spans={otelSpans}
            className="min-h-0 flex-1"
          />
        )}
      </div>
    </div>
  );
}
