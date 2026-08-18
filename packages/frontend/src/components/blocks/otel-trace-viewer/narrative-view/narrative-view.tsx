import { ChevronRightIcon, Layers3, MessageSquareTextIcon } from 'lucide-react';
import { useState } from 'react';

import { cn } from '#lib/utils';

import {
  detectLogSeverity,
  LOG_SEVERITY_LABEL_CLASS,
} from '../trace-presentation';
import { STATUS_BG } from '../trace-presentation';
import type { OtelEvent, OtelSpan, SpanNode, TraceGroup } from '../trace-model';
import { formatDuration, spanDuration } from '../trace-model';
import {
  buildNarrativeItems,
  defaultOpenSpanIds,
  narrativeHeadline,
} from './layout';

const MESSAGE_KEYS = [
  'body',
  'message',
  'log.message',
  'exception.message',
] as const;

function messageFor(event: OtelEvent): string | null {
  for (const key of MESSAGE_KEYS) {
    const value = event.attributes[key];
    if (value === undefined || value === null) continue;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return null;
}

interface NarrativeProps {
  trace: TraceGroup;
  selectedSpanId: string | null;
  onSpanClick: (span: OtelSpan) => void;
  selectedLog?: OtelEvent | null;
  onLogClick?: (span: OtelSpan, event: OtelEvent) => void;
}

export function Narrative({
  trace,
  selectedSpanId,
  onSpanClick,
  selectedLog = null,
  onLogClick,
}: NarrativeProps) {
  const [openSpanIds, setOpenSpanIds] = useState<ReadonlySet<string>>(() =>
    defaultOpenSpanIds(trace.roots),
  );
  const [openTraceId, setOpenTraceId] = useState(trace.traceId);
  if (openTraceId !== trace.traceId) {
    setOpenTraceId(trace.traceId);
    setOpenSpanIds(defaultOpenSpanIds(trace.roots));
  }

  const toggleSpan = (span: OtelSpan) => {
    setOpenSpanIds((current) => {
      const next = new Set(current);
      if (next.has(span.spanId)) next.delete(span.spanId);
      else next.add(span.spanId);
      return next;
    });
    onSpanClick(span);
  };

  return (
    <div className="flex flex-col gap-2 p-4">
      {trace.roots.map((root) => (
        <NarrativeSpan
          key={root.span.spanId}
          node={root}
          openSpanIds={openSpanIds}
          selectedSpanId={selectedSpanId}
          onToggle={toggleSpan}
          selectedLog={selectedLog}
          onLogClick={onLogClick}
        />
      ))}
    </div>
  );
}

interface NarrativeSpanProps {
  node: SpanNode;
  parentStart?: number;
  openSpanIds: ReadonlySet<string>;
  selectedSpanId: string | null;
  onToggle: (span: OtelSpan) => void;
  selectedLog: OtelEvent | null;
  onLogClick?: (span: OtelSpan, event: OtelEvent) => void;
}

function NarrativeSpan({
  node,
  parentStart,
  openSpanIds,
  selectedSpanId,
  onToggle,
  selectedLog,
  onLogClick,
}: NarrativeSpanProps) {
  const { span } = node;
  const open = openSpanIds.has(span.spanId);
  const hasContent = node.children.length > 0 || span.events.length > 0;
  const selected = selectedSpanId === span.spanId;
  const items = open ? buildNarrativeItems(node) : [];

  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onToggle(span)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/40',
          selected && 'bg-primary/10 hover:bg-primary/10',
        )}
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
            !hasContent && 'invisible',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'size-2 shrink-0 rounded-full',
            STATUS_BG[span.status],
            span.status === 'running' && 'animate-pulse',
          )}
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm leading-snug',
            selected && 'font-medium',
          )}
          title={span.name}
        >
          {narrativeHeadline(span)}
        </span>
        {parentStart !== undefined && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
            +{formatDuration(Math.max(span.startTime - parentStart, 0))}
          </span>
        )}
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
          {span.endTime === null
            ? 'still running…'
            : formatDuration(spanDuration(span))}
        </span>
      </button>

      {open && (
        <div className="ml-[15px] flex flex-col gap-1 border-l border-border/50 py-1 pl-4">
          {items.length === 0 && (
            <span className="px-2 py-1 text-xs italic text-muted-foreground">
              Nothing recorded inside this span.
            </span>
          )}
          {items.map((item, index) =>
            item.kind === 'event' ? (
              <NarrativeEventLine
                key={`event:${item.event.timestamp}:${item.event.name}:${index}`}
                span={span}
                event={item.event}
                selected={selectedLog === item.event}
                onClick={
                  onLogClick ? () => onLogClick(span, item.event) : undefined
                }
              />
            ) : item.nodes.length > 1 ? (
              <div
                key={`parallel:${item.nodes[0]!.span.spanId}`}
                className="flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 p-2"
              >
                <span className="flex items-center gap-1.5 px-1 pb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Layers3 aria-hidden className="size-3" />
                  in parallel · {item.nodes.length}
                </span>
                {item.nodes.map((child) => (
                  <NarrativeSpan
                    key={child.span.spanId}
                    node={child}
                    parentStart={span.startTime}
                    openSpanIds={openSpanIds}
                    selectedSpanId={selectedSpanId}
                    onToggle={onToggle}
                    selectedLog={selectedLog}
                    onLogClick={onLogClick}
                  />
                ))}
              </div>
            ) : (
              <NarrativeSpan
                key={item.nodes[0]!.span.spanId}
                node={item.nodes[0]!}
                parentStart={span.startTime}
                openSpanIds={openSpanIds}
                selectedSpanId={selectedSpanId}
                onToggle={onToggle}
                selectedLog={selectedLog}
                onLogClick={onLogClick}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

interface NarrativeEventLineProps {
  span: OtelSpan;
  event: OtelEvent;
  selected: boolean;
  onClick?: () => void;
}

function NarrativeEventLine({
  span,
  event,
  selected,
  onClick,
}: NarrativeEventLineProps) {
  const severity = detectLogSeverity(event);
  const message = messageFor(event);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-muted/40',
        selected && 'bg-primary/10 hover:bg-primary/10',
        !onClick && 'cursor-default',
      )}
    >
      <MessageSquareTextIcon
        aria-hidden
        className={cn(
          'size-3 shrink-0',
          severity
            ? LOG_SEVERITY_LABEL_CLASS[severity]
            : 'text-muted-foreground/50',
        )}
      />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {message ?? event.name}
      </span>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/70">
        +{formatDuration(Math.max(event.timestamp - span.startTime, 0))}
      </span>
    </button>
  );
}
