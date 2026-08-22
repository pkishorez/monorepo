import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { RecordedFlowSchema } from '@pkishorez/effect-tracer/flow';
import { Button } from '#components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '#components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '#components/ui/sheet';
import { useIsMobile } from '#hooks/use-mobile';
import { scrollbarStyles } from '#lib/scrollStyles';
import { cn } from '#lib/utils';
import { FlowItemDetails, FlowSwimlane } from '../flow-swimlane/flow-swimlane';
import { TraceViewer } from '../otel-trace-viewer/trace-viewer';
import { FlowPeekBar } from './flow-peek-bar';

type RecordedFlow = typeof RecordedFlowSchema.Type;
type RecordedFlowItem = RecordedFlow['items'][number];

interface TraceTarget {
  readonly traceId: string;
  readonly spanId: string;
}

interface FlowSectionProps {
  readonly flows: readonly RecordedFlow[];
  /** Every recorded span, so an activity can open the trace it belongs to. */
  readonly spans: ComponentProps<typeof TraceViewer>['spans'];
  readonly className?: string;
}

const shortNameOf = (participantName: string): string => {
  const lane = participantName.split('/').pop() ?? participantName;
  return lane.split('.').pop() ?? lane;
};

const storeOf = (participantName: string): string | null => {
  const lane = participantName.split('/').pop() ?? participantName;
  const dot = lane.lastIndexOf('.');
  return dot === -1 ? null : lane.slice(0, dot);
};

interface FlowSummary {
  readonly name: string;
  readonly store: string | null;
  readonly rows: number | null;
  readonly leadership: string | null;
  readonly tone: 'running' | 'idle' | 'failed';
}

const summarize = (flow: RecordedFlow): FlowSummary => {
  const lane = flow.activations[0]?.participantName ?? flow.id;
  let rows: number | null = null;
  let leadership: string | null = null;
  for (const item of flow.items) {
    if (item.kind === 'local-event' && item.name === 'Collection ready') {
      const value = item.attributes?.rows ?? item.attributes?.entityCount;
      if (typeof value === 'number') rows = value;
    }
    if (
      item.kind === 'local-event' &&
      typeof item.attributes?.leadership === 'string'
    ) {
      leadership = item.attributes.leadership;
    }
  }
  const tone: FlowSummary['tone'] = flow.activations.some(
    ({ outcome }) => outcome === 'failed',
  )
    ? 'failed'
    : flow.activations.some(({ endItemId }) => endItemId === null)
      ? 'running'
      : 'idle';
  return {
    name: shortNameOf(lane),
    store: storeOf(lane),
    rows,
    leadership,
    tone,
  };
};

const toneDot: Record<FlowSummary['tone'], string> = {
  running: 'bg-primary',
  idle: 'bg-muted-foreground/40',
  failed: 'bg-destructive',
};

const leadershipWord: Record<string, string> = {
  leading: 'this tab syncs',
  waiting: 'another tab syncs',
  released: 'sync released',
};

/** Lets the developer pick a recorded Flow, then shows it. */
export function FlowSection({ flows, spans, className }: FlowSectionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<RecordedFlowItem | null>(
    null,
  );
  const summaries = useMemo(() => {
    const all = flows.map((flow) => [flow.id, summarize(flow)] as const);
    const names = new Map<string, number>();
    for (const [, summary] of all)
      names.set(summary.name, (names.get(summary.name) ?? 0) + 1);
    return new Map(
      all.map(([id, summary]) => [
        id,
        { ...summary, ambiguous: (names.get(summary.name) ?? 0) > 1 },
      ]),
    );
  }, [flows]);
  const [inspecting, setInspecting] = useState(false);
  const [trace, setTrace] = useState<TraceTarget | null>(null);
  const isMobile = useIsMobile();
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const traceSpans = useMemo(
    () =>
      trace === null
        ? []
        : spans.filter((span) => span.traceId === trace.traceId),
    [spans, trace],
  );
  const selected =
    flows.find((flow) => flow.id === selectedId) ?? flows[0] ?? null;

  useEffect(() => {
    if (!flows.some((flow) => flow.id === selectedId)) {
      setSelectedId(flows[0]?.id ?? null);
    }
  }, [flows, selectedId]);

  useEffect(() => {
    setSelectedItem(null);
  }, [selected?.id]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [selected?.id]);

  if (flows.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          className,
        )}
      >
        No flows recorded yet.
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5">
        {flows.map((flow) => {
          const summary = summaries.get(flow.id)!;
          return (
            <Button
              key={flow.id}
              ref={flow.id === selected?.id ? activeTabRef : undefined}
              variant={flow.id === selected?.id ? 'secondary' : 'ghost'}
              size="sm"
              className="shrink-0 gap-2"
              title={flow.id}
              onClick={() => setSelectedId(flow.id)}
            >
              <span
                aria-hidden
                className={cn('size-1.5 rounded-full', toneDot[summary.tone])}
              />
              <span className="font-medium">
                {summary.ambiguous && summary.store !== null
                  ? `${summary.store} · ${summary.name}`
                  : summary.name}
              </span>
              {(summary.rows !== null || summary.leadership !== null) && (
                <span className="font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
                  {[
                    summary.rows !== null ? `${summary.rows} rows` : null,
                    summary.leadership !== null
                      ? (leadershipWord[summary.leadership] ??
                        summary.leadership)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </Button>
          );
        })}
      </div>
      <div className="relative flex min-h-0 flex-1">
        {selected && (
          <FlowSwimlane
            flow={selected}
            className="min-w-0 flex-1"
            selectedItemId={selectedItem?.id ?? null}
            onSelectionChange={setSelectedItem}
          />
        )}
        {!isMobile && (
          <div
            className={cn(
              'w-96 shrink-0 overflow-y-auto border-l',
              scrollbarStyles,
            )}
          >
            {selectedItem ? (
              <FlowItemDetails item={selectedItem} onOpenTrace={setTrace} />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
                Select a flow item to inspect its attributes
              </div>
            )}
          </div>
        )}
        {selectedItem && isMobile && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3">
            <FlowPeekBar
              item={selectedItem}
              onOpen={() => setInspecting(true)}
              onClear={() => setSelectedItem(null)}
            />
          </div>
        )}
      </div>
      <Sheet
        open={isMobile && inspecting && selectedItem !== null}
        onOpenChange={(open) => !open && setInspecting(false)}
      >
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="h-[85vh] gap-0 overflow-hidden rounded-t-xl p-0"
        >
          <SheetTitle className="sr-only">
            {selectedItem?.name ?? 'Flow item'}
          </SheetTitle>
          <div
            aria-hidden
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          />
          <div
            className={cn('min-h-0 flex-1 overflow-y-auto', scrollbarStyles)}
          >
            {selectedItem && (
              <FlowItemDetails
                item={selectedItem}
                onClose={() => setInspecting(false)}
                onOpenTrace={setTrace}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog
        open={trace !== null}
        onOpenChange={(open) => !open && setTrace(null)}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[92vh] max-h-[92vh] w-[min(96vw,110rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[110rem]"
        >
          <DialogTitle className="sr-only">Trace</DialogTitle>
          {trace && (
            <TraceViewer
              spans={traceSpans}
              initialSelectedSpanId={trace.spanId}
              className="h-full rounded-none border-0"
              emptyMessage="This trace is no longer in the recording."
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
