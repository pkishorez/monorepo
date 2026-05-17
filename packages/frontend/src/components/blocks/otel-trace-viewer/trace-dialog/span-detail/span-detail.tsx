import { XIcon } from 'lucide-react';

import { Button } from '#components/ui/button';

import { StatusDot } from '../../status';
import type { OtelSpan } from '../../types';
import { formatDuration, spanDuration } from '../../utils';
import { AttributeSection } from './attribute-section';
import { EventSection } from './event-section';

interface SpanDetailProps {
  span: OtelSpan;
  onClose: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

export function SpanDetail({ span, onClose }: SpanDetailProps) {
  const hasAttributes = Object.keys(span.attributes).length > 0;
  const hasEvents = span.events.length > 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <StatusDot status={span.status} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium">
          {span.name}
        </span>
        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
          {formatDuration(spanDuration(span))}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          className="shrink-0"
        >
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      <div className="flex flex-col gap-6 px-5 py-5">
        {hasAttributes && (
          <div>
            <SectionLabel>Attributes</SectionLabel>
            <AttributeSection attributes={span.attributes} />
          </div>
        )}

        {hasEvents && (
          <div>
            <SectionLabel>Events</SectionLabel>
            <EventSection events={span.events} spanStart={span.startTime} />
          </div>
        )}

        {!hasAttributes && !hasEvents && (
          <p className="text-xs text-muted-foreground">
            No attributes or events.
          </p>
        )}
      </div>
    </div>
  );
}
